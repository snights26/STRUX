"""Isolated PyNiteFEA 3.2.1 linear-static runner for STRUX solver-input v2.

Reads one JSON SolverInput object from stdin and writes one JSON SolverResult to stdout.
It intentionally has no file, UI, or project-schema responsibilities.
"""

from __future__ import annotations

import io
import json
import math
import sys
import traceback
from contextlib import redirect_stdout
from importlib.metadata import version
from typing import Any

from Pynite import FEModel3D

INPUT_VERSION = 2
LEGACY_INPUT_VERSION = 1
RESULT_VERSION = 2
ENGINE_VERSION = "3.2.1"
NODE_DIRECTIONS = ("FX", "FY", "FZ", "MX", "MY", "MZ")
MEMBER_POINT_DIRECTIONS = ("Fx", "Fy", "Fz", "FX", "FY", "FZ", "Mx", "My", "Mz", "MX", "MY", "MZ")
MEMBER_DISTRIBUTED_DIRECTIONS = ("Fx", "Fy", "Fz", "FX", "FY", "FZ")


class InputRejected(ValueError):
    pass


def diagnostic(severity: str, code: str, message: str, path: str | None = None) -> dict[str, str]:
    result = {"severity": severity, "code": code, "message": message}
    if path is not None:
        result["path"] = path
    return result


def result_base(payload: dict[str, Any], status: str, diagnostics: list[dict[str, str]], cases: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    return {
        "version": RESULT_VERSION,
        "status": status,
        "experimental": True,
        "engine": {"name": "PyNiteFEA", "version": version("PyNiteFEA")},
        "inputHash": payload.get("inputHash", "unknown"),
        "projectRevision": payload.get("projectRevision", "unknown"),
        "diagnostics": diagnostics,
        "cases": cases or [],
    }


def finite(value: Any, path: str) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
        raise InputRejected(f"{path} must be a finite number.")
    return float(value)


def string(value: Any, path: str) -> str:
    if not isinstance(value, str) or not value:
        raise InputRejected(f"{path} must be a non-empty string.")
    return value


def array(value: Any, path: str) -> list[Any]:
    if not isinstance(value, list):
        raise InputRejected(f"{path} must be an array.")
    return value


def record(value: Any, path: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise InputRejected(f"{path} must be an object.")
    return value


def name_for(mapping: dict[str, Any], entity_id: str, path: str) -> str:
    return string(mapping.get(entity_id), path)


def surface_ref(mesh_id: str, entity_id: str) -> str:
    return f"{mesh_id}/{entity_id}"


def combo_name(combo_id: str) -> str:
    return f"STRUX::{combo_id}"


def case_name(case_id: str) -> str:
    return f"CASE::{case_id}"


def displacement(node: Any, combo: str) -> dict[str, float]:
    return {"x": float(node.DX.get(combo, 0.0)), "y": float(node.DY.get(combo, 0.0)), "z": float(node.DZ.get(combo, 0.0))}


def rotation(node: Any, combo: str) -> dict[str, float]:
    return {"x": float(node.RX.get(combo, 0.0)), "y": float(node.RY.get(combo, 0.0)), "z": float(node.RZ.get(combo, 0.0))}


def reaction(node: Any, combo: str) -> dict[str, float]:
    return {
        "fx": float(node.RxnFX.get(combo, 0.0)), "fy": float(node.RxnFY.get(combo, 0.0)), "fz": float(node.RxnFZ.get(combo, 0.0)),
        "mx": float(node.RxnMX.get(combo, 0.0)), "my": float(node.RxnMY.get(combo, 0.0)), "mz": float(node.RxnMZ.get(combo, 0.0)),
    }


def component(values: Any, index: int) -> float:
    """Normalizes PyNite's (n,) and (n, 1) NumPy result vectors to JSON floats."""
    return float(values.flat[index])


def validate_header(payload: dict[str, Any]) -> None:
    if payload.get("version") not in (LEGACY_INPUT_VERSION, INPUT_VERSION):
        raise InputRejected(f"Unsupported solver-input version: {payload.get('version')!r}.")
    if payload.get("coordinateConvention") != "right-handed-x-y-up-z":
        raise InputRejected("Solver input must declare the STRUX right-handed X/Y-up/Z convention.")
    if payload.get("units") != "SI-m-N-Pa":
        raise InputRejected("Solver input must use SI-m-N-Pa units.")
    if record(payload.get("engine"), "engine").get("version") != ENGINE_VERSION:
        raise InputRejected("Solver input is not pinned to PyNiteFEA 3.2.1.")


def run(payload: dict[str, Any]) -> dict[str, Any]:
    validate_header(payload)
    node_names = record(payload.get("nodeNameById"), "nodeNameById")
    member_names = record(payload.get("memberNameById"), "memberNameById")
    material_names = record(payload.get("materialNameById"), "materialNameById")
    section_names = record(payload.get("sectionNameById"), "sectionNameById")
    surface_node_names = record(payload.get("surfaceNodeNameByRef", {}), "surfaceNodeNameByRef")
    surface_element_names = record(payload.get("surfaceElementNameByRef", {}), "surfaceElementNameByRef")
    nodes = array(payload.get("nodes"), "nodes")
    materials = array(payload.get("materials"), "materials")
    sections = array(payload.get("sections"), "sections")
    members = array(payload.get("members"), "members")
    surface_meshes = array(payload.get("surfaceMeshes", []), "surfaceMeshes")
    supports = array(payload.get("supports"), "supports")
    load_cases = array(payload.get("loadCases"), "loadCases")
    combinations = array(payload.get("loadCombinations"), "loadCombinations")
    if not nodes or (not members and not surface_meshes) or not combinations:
        raise InputRejected("A solver run requires at least one node, one member or supported surface mesh, and a requested load case/combination.")

    model = FEModel3D()
    model_node_positions: dict[str, tuple[float, float, float]] = {}
    node_ids: set[str] = set()
    member_ids: set[str] = set()
    material_ids: set[str] = set()
    section_ids: set[str] = set()
    case_ids: set[str] = set()
    surface_mesh_by_id: dict[str, dict[str, Any]] = {}
    surface_elements_by_mesh: dict[str, list[dict[str, Any]]] = {}

    for index, item in enumerate(nodes):
        item = record(item, f"nodes[{index}]")
        entity_id = string(item.get("id"), f"nodes[{index}].id")
        position = record(item.get("position"), f"nodes[{index}].position")
        name = name_for(node_names, entity_id, f"nodeNameById[{entity_id}]")
        coordinates = (finite(position.get("x"), f"nodes[{index}].position.x"), finite(position.get("y"), f"nodes[{index}].position.y"), finite(position.get("z"), f"nodes[{index}].position.z"))
        model.add_node(name, *coordinates)
        model_node_positions[name] = coordinates
        node_ids.add(entity_id)

    for index, item in enumerate(materials):
        item = record(item, f"materials[{index}]")
        entity_id = string(item.get("id"), f"materials[{index}].id")
        model.add_material(name_for(material_names, entity_id, f"materialNameById[{entity_id}]"), finite(item.get("elasticModulus"), f"materials[{index}].elasticModulus"), finite(item.get("shearModulus"), f"materials[{index}].shearModulus"), finite(item.get("poissonRatio"), f"materials[{index}].poissonRatio"), finite(item.get("density"), f"materials[{index}].density"), item.get("yieldStrength"))
        material_ids.add(entity_id)

    # PyNiteFEA 3.2.1 exposes public Quad3D creation and results. The v2
    # contract contains quad4-only meshes; tri3 must have been rejected by
    # the TypeScript translator before this isolated process is invoked.
    for mesh_index, raw_mesh in enumerate(surface_meshes):
        mesh = record(raw_mesh, f"surfaceMeshes[{mesh_index}]")
        mesh_id = string(mesh.get("id"), f"surfaceMeshes[{mesh_index}].id")
        if mesh_id in surface_mesh_by_id:
            raise InputRejected(f"surfaceMeshes[{mesh_index}].id is duplicated.")
        material_id = string(mesh.get("materialId"), f"surfaceMeshes[{mesh_index}].materialId")
        thickness = finite(mesh.get("thickness"), f"surfaceMeshes[{mesh_index}].thickness")
        if material_id not in material_ids or thickness <= 0:
            raise InputRejected(f"surfaceMeshes[{mesh_index}] requires a known material and positive thickness.")
        mesh_nodes = array(mesh.get("nodes"), f"surfaceMeshes[{mesh_index}].nodes")
        mesh_node_ids: set[str] = set()
        for node_index, raw_node in enumerate(mesh_nodes):
            node = record(raw_node, f"surfaceMeshes[{mesh_index}].nodes[{node_index}]")
            node_id = string(node.get("id"), f"surfaceMeshes[{mesh_index}].nodes[{node_index}].id")
            if node_id in mesh_node_ids:
                raise InputRejected(f"surfaceMeshes[{mesh_index}] contains duplicate node '{node_id}'.")
            mesh_node_ids.add(node_id)
            position = record(node.get("position"), f"surfaceMeshes[{mesh_index}].nodes[{node_index}].position")
            coordinates = (finite(position.get("x"), f"surfaceMeshes[{mesh_index}].nodes[{node_index}].position.x"), finite(position.get("y"), f"surfaceMeshes[{mesh_index}].nodes[{node_index}].position.y"), finite(position.get("z"), f"surfaceMeshes[{mesh_index}].nodes[{node_index}].position.z"))
            node_name = name_for(surface_node_names, surface_ref(mesh_id, node_id), f"surfaceNodeNameByRef[{mesh_id}/{node_id}]")
            existing = model_node_positions.get(node_name)
            if existing is None:
                model.add_node(node_name, *coordinates)
                model_node_positions[node_name] = coordinates
            elif any(abs(left - right) > 1e-8 for left, right in zip(existing, coordinates)):
                raise InputRejected(f"surfaceMeshes[{mesh_index}].nodes[{node_index}] maps to solver node '{node_name}' with different coordinates.")
        mesh_elements = array(mesh.get("elements"), f"surfaceMeshes[{mesh_index}].elements")
        if not mesh_elements:
            raise InputRejected(f"surfaceMeshes[{mesh_index}] must contain at least one quad4 element.")
        element_ids: set[str] = set()
        parsed_elements: list[dict[str, Any]] = []
        for element_index, raw_element in enumerate(mesh_elements):
            element = record(raw_element, f"surfaceMeshes[{mesh_index}].elements[{element_index}]")
            element_id = string(element.get("id"), f"surfaceMeshes[{mesh_index}].elements[{element_index}].id")
            node_refs = array(element.get("nodeIds"), f"surfaceMeshes[{mesh_index}].elements[{element_index}].nodeIds")
            if element_id in element_ids or len(node_refs) != 4 or not all(isinstance(item, str) for item in node_refs) or len(set(node_refs)) != 4 or any(item not in mesh_node_ids for item in node_refs):
                raise InputRejected(f"surfaceMeshes[{mesh_index}].elements[{element_index}] must be a connected quad4 with four unique mesh node IDs.")
            element_ids.add(element_id)
            quad_name = name_for(surface_element_names, surface_ref(mesh_id, element_id), f"surfaceElementNameByRef[{mesh_id}/{element_id}]")
            quad_nodes = [name_for(surface_node_names, surface_ref(mesh_id, item), f"surfaceNodeNameByRef[{mesh_id}/{item}]") for item in node_refs]
            model.add_quad(quad_name, quad_nodes[0], quad_nodes[1], quad_nodes[2], quad_nodes[3], thickness, name_for(material_names, material_id, f"materialNameById[{material_id}]"))
            parsed_elements.append({"id": element_id, "name": quad_name, "nodeIds": node_refs})
        surface_mesh_by_id[mesh_id] = mesh
        surface_elements_by_mesh[mesh_id] = parsed_elements

    for index, item in enumerate(sections):
        item = record(item, f"sections[{index}]")
        entity_id = string(item.get("id"), f"sections[{index}].id")
        model.add_section(name_for(section_names, entity_id, f"sectionNameById[{entity_id}]"), finite(item.get("area"), f"sections[{index}].area"), finite(item.get("iy"), f"sections[{index}].iy"), finite(item.get("iz"), f"sections[{index}].iz"), finite(item.get("torsionalConstant"), f"sections[{index}].torsionalConstant"))
        section_ids.add(entity_id)

    for index, item in enumerate(members):
        item = record(item, f"members[{index}]")
        entity_id = string(item.get("id"), f"members[{index}].id")
        start_id = string(item.get("startNodeId"), f"members[{index}].startNodeId")
        end_id = string(item.get("endNodeId"), f"members[{index}].endNodeId")
        material_id = string(item.get("materialId"), f"members[{index}].materialId")
        section_id = string(item.get("sectionId"), f"members[{index}].sectionId")
        if start_id not in node_ids or end_id not in node_ids or material_id not in material_ids or section_id not in section_ids:
            raise InputRejected(f"members[{index}] references an unknown node, material, or section.")
        name = name_for(member_names, entity_id, f"memberNameById[{entity_id}]")
        model.add_member(name, name_for(node_names, start_id, f"nodeNameById[{start_id}]"), name_for(node_names, end_id, f"nodeNameById[{end_id}]"), name_for(material_names, material_id, f"materialNameById[{material_id}]"), name_for(section_names, section_id, f"sectionNameById[{section_id}]"), finite(item.get("rotationDegrees"), f"members[{index}].rotationDegrees"))
        releases = array(item.get("releases"), f"members[{index}].releases")
        if len(releases) != 12 or not all(isinstance(value, bool) for value in releases):
            raise InputRejected(f"members[{index}].releases must contain 12 booleans in PyNite local-DOF order.")
        model.def_releases(name, *releases)
        member_ids.add(entity_id)

    for index, item in enumerate(supports):
        item = record(item, f"supports[{index}]")
        node_id = string(item.get("nodeId"), f"supports[{index}].nodeId")
        restraints = array(item.get("restraints"), f"supports[{index}].restraints")
        if node_id not in node_ids or len(restraints) != 6 or not all(isinstance(value, bool) for value in restraints):
            raise InputRejected(f"supports[{index}] must reference a node and contain [UX, UY, UZ, RX, RY, RZ] booleans.")
        model.def_support(name_for(node_names, node_id, f"nodeNameById[{node_id}]"), *restraints)

    for index, item in enumerate(load_cases):
        item = record(item, f"loadCases[{index}]")
        case_ids.add(string(item.get("id"), f"loadCases[{index}].id"))

    for index, item in enumerate(array(payload.get("nodalLoads"), "nodalLoads")):
        item = record(item, f"nodalLoads[{index}]")
        node_id = string(item.get("nodeId"), f"nodalLoads[{index}].nodeId")
        case_id = string(item.get("caseId"), f"nodalLoads[{index}].caseId")
        values = record(item.get("values"), f"nodalLoads[{index}].values")
        if node_id not in node_ids or case_id not in case_ids:
            raise InputRejected(f"nodalLoads[{index}] references an unknown node or load case.")
        for direction, key in zip(NODE_DIRECTIONS, ("fx", "fy", "fz", "mx", "my", "mz")):
            model.add_node_load(name_for(node_names, node_id, f"nodeNameById[{node_id}]"), direction, finite(values.get(key), f"nodalLoads[{index}].values.{key}"), case_name(case_id))

    for index, item in enumerate(array(payload.get("memberPointLoads"), "memberPointLoads")):
        item = record(item, f"memberPointLoads[{index}]")
        member_id = string(item.get("memberId"), f"memberPointLoads[{index}].memberId")
        case_id = string(item.get("caseId"), f"memberPointLoads[{index}].caseId")
        direction = string(item.get("direction"), f"memberPointLoads[{index}].direction")
        if member_id not in member_ids or case_id not in case_ids or direction not in MEMBER_POINT_DIRECTIONS:
            raise InputRejected(f"memberPointLoads[{index}] has an unsupported reference or direction.")
        model.add_member_pt_load(name_for(member_names, member_id, f"memberNameById[{member_id}]"), direction, finite(item.get("magnitude"), f"memberPointLoads[{index}].magnitude"), finite(item.get("x"), f"memberPointLoads[{index}].x"), case_name(case_id))

    for index, item in enumerate(array(payload.get("memberDistributedLoads"), "memberDistributedLoads")):
        item = record(item, f"memberDistributedLoads[{index}]")
        member_id = string(item.get("memberId"), f"memberDistributedLoads[{index}].memberId")
        case_id = string(item.get("caseId"), f"memberDistributedLoads[{index}].caseId")
        direction = string(item.get("direction"), f"memberDistributedLoads[{index}].direction")
        if member_id not in member_ids or case_id not in case_ids or direction not in MEMBER_DISTRIBUTED_DIRECTIONS:
            raise InputRejected(f"memberDistributedLoads[{index}] has an unsupported reference or direction.")
        model.add_member_dist_load(name_for(member_names, member_id, f"memberNameById[{member_id}]"), direction, finite(item.get("startMagnitude"), f"memberDistributedLoads[{index}].startMagnitude"), finite(item.get("endMagnitude"), f"memberDistributedLoads[{index}].endMagnitude"), case=case_name(case_id))

    for index, raw_load in enumerate(array(payload.get("surfacePressureLoads", []), "surfacePressureLoads")):
        load = record(raw_load, f"surfacePressureLoads[{index}]")
        mesh_id = string(load.get("surfaceMeshId"), f"surfacePressureLoads[{index}].surfaceMeshId")
        case_id = string(load.get("caseId"), f"surfacePressureLoads[{index}].caseId")
        pressure = finite(load.get("pressure"), f"surfacePressureLoads[{index}].pressure")
        if mesh_id not in surface_mesh_by_id or case_id not in case_ids or pressure == 0:
            raise InputRejected(f"surfacePressureLoads[{index}] must reference a supported surface mesh and load case with a non-zero pressure.")
        for element in surface_elements_by_mesh[mesh_id]:
            model.add_quad_surface_pressure(element["name"], pressure, case_name(case_id))

    requested: list[tuple[dict[str, Any], str]] = []
    for index, item in enumerate(combinations):
        item = record(item, f"loadCombinations[{index}]")
        combo_id = string(item.get("id"), f"loadCombinations[{index}].id")
        factors = record(item.get("factors"), f"loadCombinations[{index}].factors")
        if not factors:
            raise InputRejected(f"loadCombinations[{index}] must contain at least one factor.")
        engine_factors: dict[str, float] = {}
        for case_id, factor in factors.items():
            if case_id not in case_ids:
                raise InputRejected(f"loadCombinations[{index}] references unknown case '{case_id}'.")
            engine_factors[case_name(case_id)] = finite(factor, f"loadCombinations[{index}].factors[{case_id}]")
        engine_name = combo_name(combo_id)
        model.add_load_combo(engine_name, engine_factors)
        requested.append((item, engine_name))

    model.analyze_linear(check_stability=True, sparse=True)
    cases: list[dict[str, Any]] = []
    for requested_combo, engine_combo in requested:
        nodal_results = []
        for item in nodes:
            item = record(item, "nodes")
            node_id = string(item.get("id"), "nodes.id")
            node = model.nodes[name_for(node_names, node_id, f"nodeNameById[{node_id}]")]
            nodal_results.append({"nodeId": node_id, "displacement": displacement(node, engine_combo), "rotation": rotation(node, engine_combo), "reaction": reaction(node, engine_combo)})
        member_results = []
        for item in members:
            item = record(item, "members")
            member_id = string(item.get("id"), "members.id")
            member = model.members[name_for(member_names, member_id, f"memberNameById[{member_id}]")]
            length = float(member.L())
            samples = []
            for step in range(21):
                x = length * step / 20
                samples.append({"x": x, "deflectionY": float(member.deflection("dy", x, engine_combo)), "deflectionZ": float(member.deflection("dz", x, engine_combo)), "axial": float(member.axial(x, engine_combo)), "shearY": float(member.shear("Fy", x, engine_combo)), "shearZ": float(member.shear("Fz", x, engine_combo)), "momentY": float(member.moment("My", x, engine_combo)), "momentZ": float(member.moment("Mz", x, engine_combo))})
            member_results.append({"memberId": member_id, "length": length, "samples": samples})
        surface_results = []
        for mesh_id, mesh in surface_mesh_by_id.items():
            surface_node_results = []
            for raw_node in array(mesh.get("nodes"), f"surfaceMeshes[{mesh_id}].nodes"):
                node = record(raw_node, f"surfaceMeshes[{mesh_id}].nodes")
                node_id = string(node.get("id"), f"surfaceMeshes[{mesh_id}].nodes.id")
                model_node = model.nodes[name_for(surface_node_names, surface_ref(mesh_id, node_id), f"surfaceNodeNameByRef[{mesh_id}/{node_id}]")]
                surface_node_results.append({"nodeId": node_id, "displacement": displacement(model_node, engine_combo), "rotation": rotation(model_node, engine_combo), "reaction": reaction(model_node, engine_combo)})
            element_results = []
            for element in surface_elements_by_mesh[mesh_id]:
                quad = model.quads[element["name"]]
                moments = quad.moment(0.0, 0.0, True, engine_combo)
                shears = quad.shear(0.0, 0.0, True, engine_combo)
                stresses = quad.membrane(0.0, 0.0, True, engine_combo)
                transform = quad.T()[:3, :3]
                element_results.append({
                    "elementId": element["id"],
                    "moments": {"mx": component(moments, 0), "my": component(moments, 1), "mxy": component(moments, 2)},
                    "shears": {"qx": component(shears, 0), "qy": component(shears, 1)},
                    "membraneStress": {"sx": component(stresses, 0), "sy": component(stresses, 1), "txy": component(stresses, 2)},
                    "localAxes": {"x": {"x": float(transform[0, 0]), "y": float(transform[0, 1]), "z": float(transform[0, 2])}, "y": {"x": float(transform[1, 0]), "y": float(transform[1, 1]), "z": float(transform[1, 2])}, "z": {"x": float(transform[2, 0]), "y": float(transform[2, 1]), "z": float(transform[2, 2])}},
                })
            surface_results.append({"meshId": mesh_id, "nodeResults": surface_node_results, "elementResults": element_results})
        cases.append({"id": string(requested_combo.get("id"), "loadCombinations.id"), "name": string(requested_combo.get("name"), "loadCombinations.name"), "kind": requested_combo.get("kind"), "nodalResults": nodal_results, "memberResults": member_results, "surfaceResults": surface_results})
    return result_base(payload, "success", [diagnostic("info", "EXPERIMENTAL", "PyNiteFEA 3.2.1 linear-static frame and Quad3D shell results are experimental pending independent professor verification.")], cases)


def execute(payload: dict[str, Any]) -> dict[str, Any]:
    # PyNite emits some stability diagnostics to stdout. This process reserves
    # stdout for one JSON response, so native callers can always parse it.
    engine_stdout = io.StringIO()
    try:
        with redirect_stdout(engine_stdout):
            output = run(payload)
    except InputRejected as error:
        output = result_base(payload, "rejected", [diagnostic("error", "INPUT_REJECTED", str(error))])
    except Exception as error:  # PyNite instability and numerical failures are never converted to results.
        output = result_base(payload, "error", [diagnostic("error", "PYTHON_OR_SOLVER_ERROR", str(error)), diagnostic("info", "TRACEBACK", traceback.format_exc(limit=3))])
    emitted = engine_stdout.getvalue().strip()
    if emitted:
        output["diagnostics"].append(diagnostic("warning", "ENGINE_STDOUT", emitted))
    return output


def main() -> None:
    payload: dict[str, Any] = {}
    try:
        payload = record(json.load(sys.stdin), "root")
    except Exception as error:
        print(json.dumps(result_base(payload, "rejected", [diagnostic("error", "INVALID_JSON", str(error))]), allow_nan=False, separators=(",", ":")))
        return
    print(json.dumps(execute(payload), allow_nan=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
