"""Independent numerical checks for the STRUX Quad3D surface contract.

The clamped square-plate comparison uses w(0,0) = 0.001265319*q*a^4/D,
D = E*t^3/(12*(1-nu^2)), the classical small-deflection isotropic plate
reference. It is not derived from or calibrated to the PyNite result.
"""

import math
import json
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src" / "solver" / "python"))
from strux_pynite_runner import execute


E = 210e9
NU = 0.30
THICKNESS = 0.02
PRESSURE = 1_000.0
CLAMPED_SQUARE_COEFFICIENT = 0.001265319


def shell_payload(divisions: int, supports: bool = True) -> dict:
    """A 1 m x 1 m X-Z plate, local +Z = global -Y, with quad4 elements."""
    nodes = []
    mesh_nodes = []
    for row in range(divisions + 1):
        for column in range(divisions + 1):
            node_id = f"n-{column}-{row}"
            position = {"x": column / divisions, "y": 0.0, "z": row / divisions}
            nodes.append({"id": node_id, "name": f"N_{column}_{row}", "position": position})
            mesh_nodes.append({"id": node_id, "position": position})
    elements = []
    for row in range(divisions):
        for column in range(divisions):
            elements.append({"id": f"e-{column}-{row}", "nodeIds": [f"n-{column}-{row}", f"n-{column + 1}-{row}", f"n-{column + 1}-{row + 1}", f"n-{column}-{row + 1}"]})
    node_names = {node["id"]: node["name"] for node in nodes}
    payload = {
        "version": 2, "engine": {"name": "PyNiteFEA", "version": "3.2.1"}, "inputHash": "surface-test", "projectRevision": "surface-revision",
        "coordinateConvention": "right-handed-x-y-up-z", "units": "SI-m-N-Pa",
        "nodeNameById": node_names, "memberNameById": {}, "materialNameById": {"mat": "MAT_1"}, "sectionNameById": {},
        "surfaceNodeNameByRef": {f"mesh/{node['id']}": node["name"] for node in nodes},
        "surfaceElementNameByRef": {f"mesh/{element['id']}": f"Q_{index:04d}" for index, element in enumerate(elements, 1)},
        "nodes": nodes,
        "materials": [{"id": "mat", "name": "MAT_1", "elasticModulus": E, "shearModulus": E / (2 * (1 + NU)), "poissonRatio": NU, "density": 7850}],
        "sections": [], "members": [],
        "supports": ([{"nodeId": f"n-{column}-{row}", "restraints": [True] * 6} for row in range(divisions + 1) for column in range(divisions + 1) if column in (0, divisions) or row in (0, divisions)] if supports else []),
        "loadCases": [{"id": "pressure", "name": "Pressure"}],
        "loadCombinations": [{"id": "pressure", "name": "Pressure", "kind": "load-case", "factors": {"pressure": 1.0}}],
        "nodalLoads": [], "memberPointLoads": [], "memberDistributedLoads": [],
        "surfaceMeshes": [{"id": "mesh", "name": "Square plate", "sourceKind": "slab", "sourceId": "slab", "materialId": "mat", "thickness": THICKNESS, "nodes": mesh_nodes, "elements": elements}],
        "surfacePressureLoads": [{"id": "p", "surfaceMeshId": "mesh", "caseId": "pressure", "pressure": PRESSURE}],
    }
    return payload


def membrane_patch_payload() -> dict:
    """One quad with a uniform +X traction P on its right edge."""
    force = 100_000.0
    nodes = [
        {"id": "i", "name": "N_i", "position": {"x": 0.0, "y": 0.0, "z": 0.0}},
        {"id": "j", "name": "N_j", "position": {"x": 2.0, "y": 0.0, "z": 0.0}},
        {"id": "m", "name": "N_m", "position": {"x": 2.0, "y": 1.0, "z": 0.0}},
        {"id": "n", "name": "N_n", "position": {"x": 0.0, "y": 1.0, "z": 0.0}},
    ]
    return {
        "version": 2, "engine": {"name": "PyNiteFEA", "version": "3.2.1"}, "inputHash": "patch-test", "projectRevision": "patch-revision",
        "coordinateConvention": "right-handed-x-y-up-z", "units": "SI-m-N-Pa",
        "nodeNameById": {node["id"]: node["name"] for node in nodes}, "memberNameById": {}, "materialNameById": {"mat": "MAT_1"}, "sectionNameById": {},
        "surfaceNodeNameByRef": {f"mesh/{node['id']}": node["name"] for node in nodes}, "surfaceElementNameByRef": {"mesh/e": "Q_0001"},
        "nodes": nodes, "materials": [{"id": "mat", "name": "MAT_1", "elasticModulus": 200e9, "shearModulus": 200e9 / 2.6, "poissonRatio": 0.30, "density": 7850}], "sections": [], "members": [],
        "supports": [
            {"nodeId": "i", "restraints": [True, True, True, True, True, True]}, {"nodeId": "n", "restraints": [True, True, True, True, True, True]},
            {"nodeId": "j", "restraints": [False, False, True, True, True, True]}, {"nodeId": "m", "restraints": [False, False, True, True, True, True]},
        ],
        "loadCases": [{"id": "traction", "name": "Traction"}], "loadCombinations": [{"id": "traction", "name": "Traction", "kind": "load-case", "factors": {"traction": 1.0}}],
        "nodalLoads": [{"id": "p-j", "nodeId": "j", "caseId": "traction", "values": {"fx": force / 2, "fy": 0, "fz": 0, "mx": 0, "my": 0, "mz": 0}}, {"id": "p-m", "nodeId": "m", "caseId": "traction", "values": {"fx": force / 2, "fy": 0, "fz": 0, "mx": 0, "my": 0, "mz": 0}}],
        "memberPointLoads": [], "memberDistributedLoads": [],
        "surfaceMeshes": [{"id": "mesh", "name": "Membrane patch", "sourceKind": "wall", "sourceId": "wall", "materialId": "mat", "thickness": 0.01, "nodes": [{"id": node["id"], "position": node["position"]} for node in nodes], "elements": [{"id": "e", "nodeIds": ["i", "j", "m", "n"]}]}],
        "surfacePressureLoads": [],
    }


class PyNiteSurfaceBenchmarks(unittest.TestCase):
    def test_v2_json_process_protocol_returns_surface_provenance_and_results(self):
        payload = shell_payload(1)
        runner = Path(__file__).resolve().parents[1] / "src" / "solver" / "python" / "strux_pynite_runner.py"
        process = subprocess.run([sys.executable, "-u", str(runner)], input=json.dumps(payload), capture_output=True, text=True, timeout=20, check=False)
        self.assertEqual(process.returncode, 0, process.stderr)
        result = json.loads(process.stdout)
        self.assertEqual(result["version"], 2)
        self.assertEqual(result["status"], "success", result["diagnostics"])
        self.assertEqual(result["inputHash"], "surface-test")
        self.assertEqual(len(result["cases"][0]["surfaceResults"][0]["elementResults"]), 1)

    def test_b6_clamped_square_plate_equilibrium_displacement_and_refinement(self):
        coarse = execute(shell_payload(4))
        fine = execute(shell_payload(16))
        self.assertEqual(coarse["status"], "success", coarse["diagnostics"])
        self.assertEqual(fine["status"], "success", fine["diagnostics"])
        expected = CLAMPED_SQUARE_COEFFICIENT * PRESSURE / (E * THICKNESS ** 3 / (12 * (1 - NU ** 2)))
        coarse_center = next(node for node in coarse["cases"][0]["surfaceResults"][0]["nodeResults"] if node["nodeId"] == "n-2-2")["displacement"]["y"]
        fine_center = next(node for node in fine["cases"][0]["surfaceResults"][0]["nodeResults"] if node["nodeId"] == "n-8-8")["displacement"]["y"]
        self.assertLess(fine_center, 0.0)
        self.assertLess(abs(abs(fine_center) - expected) / expected, 0.03)
        self.assertLess(abs(abs(fine_center) - expected), abs(abs(coarse_center) - expected))
        reaction = sum(node["reaction"]["fy"] for node in fine["cases"][0]["nodalResults"])
        self.assertAlmostEqual(reaction, PRESSURE, places=6)
        element = fine["cases"][0]["surfaceResults"][0]["elementResults"][0]
        self.assertAlmostEqual(element["localAxes"]["z"]["y"], -1.0, places=12)
        self.assertEqual(len(fine["cases"][0]["surfaceResults"][0]["elementResults"]), 256)

    def test_b7_constant_membrane_stress_patch_and_reaction_equilibrium(self):
        result = execute(membrane_patch_payload())
        self.assertEqual(result["status"], "success", result["diagnostics"])
        case = result["cases"][0]
        element = case["surfaceResults"][0]["elementResults"][0]
        self.assertAlmostEqual(element["membraneStress"]["sx"], 10_000_000.0, places=2)
        self.assertAlmostEqual(sum(node["reaction"]["fx"] for node in case["nodalResults"]), -100_000.0, places=4)
        self.assertTrue(math.isfinite(element["moments"]["mx"]))

    def test_b8_invalid_and_singular_surface_models_never_return_results(self):
        invalid = shell_payload(1)
        invalid["surfaceMeshes"][0]["elements"][0]["nodeIds"] = ["n-0-0", "n-1-0", "n-1-1"]
        self.assertEqual(execute(invalid)["status"], "rejected")
        singular = shell_payload(1, supports=False)
        self.assertEqual(execute(singular)["status"], "error")


if __name__ == "__main__":
    unittest.main()
