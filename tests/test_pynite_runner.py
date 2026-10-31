import json
import math
import subprocess
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src" / "solver" / "python"))
from strux_pynite_runner import execute


E = 200e9
A = 0.01
I = 8e-6
J = 1e-5


def base_input(nodes, members, supports, cases, combinations, nodal=None, point=None, distributed=None):
    return {
        "version": 2, "engine": {"name": "PyNiteFEA", "version": "3.2.1"}, "inputHash": "test-hash", "projectRevision": "test-revision",
        "coordinateConvention": "right-handed-x-y-up-z", "units": "SI-m-N-Pa",
        "nodeNameById": {node["id"]: f"N_{index}" for index, node in enumerate(nodes)},
        "memberNameById": {member["id"]: f"M_{index}" for index, member in enumerate(members)},
        "materialNameById": {"steel": "MAT_1"}, "sectionNameById": {"section": "SEC_1"},
        "surfaceNodeNameByRef": {}, "surfaceElementNameByRef": {},
        "nodes": nodes,
        "materials": [{"id": "steel", "name": "MAT_1", "elasticModulus": E, "shearModulus": E / 2.6, "poissonRatio": 0.3, "density": 7850}],
        "sections": [{"id": "section", "name": "SEC_1", "area": A, "iy": I, "iz": I, "torsionalConstant": J}],
        "members": members, "supports": supports,
        "loadCases": [{"id": case_id, "name": case_id} for case_id in cases],
        "loadCombinations": combinations,
        "nodalLoads": nodal or [], "memberPointLoads": point or [], "memberDistributedLoads": distributed or [], "surfaceMeshes": [], "surfacePressureLoads": [],
    }


def member(member_id, start, end, releases=None):
    return {"id": member_id, "name": member_id, "startNodeId": start, "endNodeId": end, "materialId": "steel", "sectionId": "section", "rotationDegrees": 0.0, "releases": releases or [False] * 12}


def node_result(case, node_id):
    return next(item for item in case["nodalResults"] if item["nodeId"] == node_id)


class PyNiteRunnerBenchmarks(unittest.TestCase):
    def test_json_process_protocol_returns_experimental_result(self):
        payload = base_input(
            [{"id": "n1", "name": "N_0", "position": {"x": 0, "y": 0, "z": 0}}, {"id": "n2", "name": "N_1", "position": {"x": 3, "y": 0, "z": 0}}], [member("m1", "n1", "n2")],
            [{"nodeId": "n1", "restraints": [True] * 6}, {"nodeId": "n2", "restraints": [False, True, True, True, True, True]}], ["dead"], [{"id": "dead", "name": "Dead", "kind": "load-case", "factors": {"dead": 1}}],
            [{"id": "p", "nodeId": "n2", "caseId": "dead", "values": {"fx": 100000, "fy": 0, "fz": 0, "mx": 0, "my": 0, "mz": 0}}],
        )
        runner = Path(__file__).resolve().parents[1] / "src" / "solver" / "python" / "strux_pynite_runner.py"
        process = subprocess.run([sys.executable, "-u", str(runner)], input=json.dumps(payload), capture_output=True, text=True, timeout=10, check=False)
        self.assertEqual(process.returncode, 0, process.stderr)
        output = json.loads(process.stdout)
        self.assertEqual(output["status"], "success")
        self.assertTrue(output["experimental"])

    def test_json_process_protocol_keeps_instability_output_inside_diagnostics(self):
        payload = base_input(
            [{"id": "n1", "name": "N_0", "position": {"x": 0, "y": 0, "z": 0}}, {"id": "n2", "name": "N_1", "position": {"x": 3, "y": 0, "z": 0}}, {"id": "n3", "name": "N_2", "position": {"x": 0, "y": 0, "z": 0}}], [member("m1", "n1", "n2")],
            [{"nodeId": "n1", "restraints": [True] * 6}, {"nodeId": "n2", "restraints": [False, True, True, True, True, True]}], ["dead"], [{"id": "dead", "name": "Dead", "kind": "load-case", "factors": {"dead": 1}}],
        )
        runner = Path(__file__).resolve().parents[1] / "src" / "solver" / "python" / "strux_pynite_runner.py"
        process = subprocess.run([sys.executable, "-u", str(runner)], input=json.dumps(payload), capture_output=True, text=True, timeout=10, check=False)
        self.assertEqual(process.returncode, 0, process.stderr)
        output = json.loads(process.stdout)
        self.assertEqual(output["status"], "error")
        self.assertTrue(process.stdout.lstrip().startswith("{"))
        self.assertTrue(any(item["code"] == "ENGINE_STDOUT" for item in output["diagnostics"]))

    def test_b1_axial_bar_displacement_reaction_and_equilibrium(self):
        payload = base_input(
            [{"id": "n1", "name": "N_0", "position": {"x": 0, "y": 0, "z": 0}}, {"id": "n2", "name": "N_1", "position": {"x": 3, "y": 0, "z": 0}}],
            [member("m1", "n1", "n2")],
            [{"nodeId": "n1", "restraints": [True] * 6}, {"nodeId": "n2", "restraints": [False, True, True, True, True, True]}], ["dead"],
            [{"id": "dead", "name": "Dead", "kind": "load-case", "factors": {"dead": 1}}],
            [{"id": "p", "nodeId": "n2", "caseId": "dead", "values": {"fx": 100000, "fy": 0, "fz": 0, "mx": 0, "my": 0, "mz": 0}}],
        )
        result = execute(payload)
        self.assertEqual(result["status"], "success", result["diagnostics"])
        case = result["cases"][0]
        self.assertAlmostEqual(node_result(case, "n2")["displacement"]["x"], 0.00015, places=10)
        self.assertAlmostEqual(node_result(case, "n1")["reaction"]["fx"], -100000, places=4)
        self.assertAlmostEqual(sum(node["reaction"]["fx"] for node in case["nodalResults"]) + 100000, 0, places=4)

    def test_b2_cantilever_uses_iz_for_global_y_bending(self):
        payload = base_input(
            [{"id": "n1", "name": "N_0", "position": {"x": 0, "y": 0, "z": 0}}, {"id": "n2", "name": "N_1", "position": {"x": 4, "y": 0, "z": 0}}],
            [member("m1", "n1", "n2")], [{"nodeId": "n1", "restraints": [True] * 6}], ["dead"],
            [{"id": "dead", "name": "Dead", "kind": "load-case", "factors": {"dead": 1}}],
            [{"id": "p", "nodeId": "n2", "caseId": "dead", "values": {"fx": 0, "fy": -10000, "fz": 0, "mx": 0, "my": 0, "mz": 0}}],
        )
        result = execute(payload)
        self.assertEqual(result["status"], "success", result["diagnostics"])
        case = result["cases"][0]
        self.assertAlmostEqual(node_result(case, "n2")["displacement"]["y"], -0.13333333333333333, places=9)
        self.assertAlmostEqual(node_result(case, "n1")["reaction"]["fy"], 10000, places=4)
        self.assertAlmostEqual(abs(node_result(case, "n1")["reaction"]["mz"]), 40000, places=4)

    def test_b3_simply_supported_udl_and_releases(self):
        releases = [False, False, False, False, False, True] * 2
        payload = base_input(
            [{"id": "n1", "name": "N_0", "position": {"x": 0, "y": 0, "z": 0}}, {"id": "n2", "name": "N_1", "position": {"x": 6, "y": 0, "z": 0}}],
            [member("m1", "n1", "n2", releases)],
            [{"nodeId": "n1", "restraints": [True, True, True, True, True, True]}, {"nodeId": "n2", "restraints": [False, True, True, False, False, True]}], ["dead"],
            [{"id": "dead", "name": "Dead", "kind": "load-case", "factors": {"dead": 1}}],
            distributed=[{"id": "w", "memberId": "m1", "caseId": "dead", "direction": "FY", "startMagnitude": -5000, "endMagnitude": -5000, "source": "member-distributed"}],
        )
        result = execute(payload)
        self.assertEqual(result["status"], "success", result["diagnostics"])
        case = result["cases"][0]
        self.assertAlmostEqual(node_result(case, "n1")["reaction"]["fy"], 15000, places=3)
        self.assertAlmostEqual(node_result(case, "n2")["reaction"]["fy"], 15000, places=3)
        middle = case["memberResults"][0]["samples"][10]
        self.assertAlmostEqual(middle["deflectionY"], -0.052734375, places=8)
        self.assertAlmostEqual(abs(middle["momentZ"]), 22500, places=3)

    def test_b4_simply_supported_member_point_load(self):
        releases = [False, False, False, False, False, True] * 2
        payload = base_input(
            [{"id": "n1", "name": "N_0", "position": {"x": 0, "y": 0, "z": 0}}, {"id": "n2", "name": "N_1", "position": {"x": 6, "y": 0, "z": 0}}],
            [member("m1", "n1", "n2", releases)],
            [{"nodeId": "n1", "restraints": [True, True, True, True, True, True]}, {"nodeId": "n2", "restraints": [False, True, True, False, False, True]}], ["dead"],
            [{"id": "dead", "name": "Dead", "kind": "load-case", "factors": {"dead": 1}}],
            point=[{"id": "p", "memberId": "m1", "caseId": "dead", "direction": "FY", "magnitude": -12000, "x": 3, "source": "member-point"}],
        )
        result = execute(payload)
        self.assertEqual(result["status"], "success", result["diagnostics"])
        case = result["cases"][0]
        self.assertAlmostEqual(node_result(case, "n1")["reaction"]["fy"], 6000, places=3)
        self.assertAlmostEqual(node_result(case, "n2")["reaction"]["fy"], 6000, places=3)
        middle = case["memberResults"][0]["samples"][10]
        self.assertAlmostEqual(middle["deflectionY"], -0.03375, places=8)
        self.assertAlmostEqual(abs(middle["momentZ"]), 18000, places=3)

    def test_b5_portal_load_combination_linearity_and_equilibrium(self):
        nodes = [
            {"id": "n1", "name": "N_0", "position": {"x": 0, "y": 0, "z": 0}}, {"id": "n2", "name": "N_1", "position": {"x": 0, "y": 3, "z": 0}},
            {"id": "n3", "name": "N_2", "position": {"x": 6, "y": 3, "z": 0}}, {"id": "n4", "name": "N_3", "position": {"x": 6, "y": 0, "z": 0}},
        ]
        payload = base_input(nodes, [member("c1", "n1", "n2"), member("b", "n2", "n3"), member("c2", "n4", "n3")], [{"nodeId": "n1", "restraints": [True] * 6}, {"nodeId": "n4", "restraints": [True] * 6}], ["dead", "live"], [
            {"id": "dead", "name": "Dead", "kind": "load-case", "factors": {"dead": 1}}, {"id": "live", "name": "Live", "kind": "load-case", "factors": {"live": 1}}, {"id": "ultimate", "name": "1.2D+1.6L", "kind": "combination", "factors": {"dead": 1.2, "live": 1.6}},
        ], [
            {"id": "d1", "nodeId": "n2", "caseId": "dead", "values": {"fx": 0, "fy": -10000, "fz": 0, "mx": 0, "my": 0, "mz": 0}}, {"id": "d2", "nodeId": "n3", "caseId": "dead", "values": {"fx": 0, "fy": -10000, "fz": 0, "mx": 0, "my": 0, "mz": 0}},
            {"id": "l", "nodeId": "n3", "caseId": "live", "values": {"fx": 10000, "fy": 0, "fz": 0, "mx": 0, "my": 0, "mz": 0}},
        ])
        result = execute(payload)
        self.assertEqual(result["status"], "success", result["diagnostics"])
        by_id = {case["id"]: case for case in result["cases"]}
        dead, live, ultimate = by_id["dead"], by_id["live"], by_id["ultimate"]
        for axis in ("x", "y", "z"):
            expected = 1.2 * node_result(dead, "n3")["displacement"][axis] + 1.6 * node_result(live, "n3")["displacement"][axis]
            self.assertAlmostEqual(node_result(ultimate, "n3")["displacement"][axis], expected, places=10)
        self.assertAlmostEqual(sum(node["reaction"]["fx"] for node in ultimate["nodalResults"]) + 16000, 0, places=3)
        self.assertAlmostEqual(sum(node["reaction"]["fy"] for node in ultimate["nodalResults"]) - 24000, 0, places=3)

    def test_rejects_bad_direction_and_marks_unstable_model_as_no_result(self):
        payload = base_input(
            [{"id": "n1", "name": "N_0", "position": {"x": 0, "y": 0, "z": 0}}, {"id": "n2", "name": "N_1", "position": {"x": 3, "y": 0, "z": 0}}], [member("m1", "n1", "n2")], [{"nodeId": "n1", "restraints": [True] * 6}], ["dead"], [{"id": "dead", "name": "Dead", "kind": "load-case", "factors": {"dead": 1}}],
            point=[{"id": "bad", "memberId": "m1", "caseId": "dead", "direction": "BAD", "magnitude": 1, "x": 1, "source": "member-point"}],
        )
        self.assertEqual(execute(payload)["status"], "rejected")
        payload["memberPointLoads"] = []
        payload["supports"] = []
        self.assertEqual(execute(payload)["status"], "error")


if __name__ == "__main__":
    unittest.main()
