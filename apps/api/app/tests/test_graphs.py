"""
CAUSAL API Tests — Graph, Node, and Dependency endpoints (Phase 2).
"""

import uuid
import pytest
from fastapi.testclient import TestClient

@pytest.mark.integration
class TestGraphAPI:
    def test_create_graph(self, client: TestClient):
        response = client.post("/api/v1/graphs", json={
            "name": "Test Graph",
            "domain": "test",
            "version": 1
        })
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Graph"
        assert "id" in data
        
        # Cleanup
        client.delete(f"/api/v1/graphs/{data['id']}")

    def test_list_graphs(self, client: TestClient):
        response = client.get("/api/v1/graphs")
        assert response.status_code == 200
        assert isinstance(response.json(), list)

@pytest.mark.integration
class TestNodeAPI:
    def test_create_node(self, client: TestClient):
        # Create a graph
        g_res = client.post("/api/v1/graphs", json={"name": "Node Test", "domain": "test", "version": 1})
        g_id = g_res.json()["id"]

        # Create a node
        response = client.post(f"/api/v1/graphs/{g_id}/nodes", json={
            "name": "Test Node",
            "type": "server",
            "state": "NORMAL",
            "health": 1.0,
            "capacity": 1.0,
            "criticality": 0.5
        })
        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Test Node"
        assert data["state"] == "NORMAL"

        # Cleanup
        client.delete(f"/api/v1/graphs/{g_id}")

@pytest.mark.integration
class TestDependencyAPI:
    def test_create_dependency(self, client: TestClient):
        # Create a graph
        g_res = client.post("/api/v1/graphs", json={"name": "Dep Test", "domain": "test", "version": 1})
        g_id = g_res.json()["id"]

        # Create 2 nodes
        n1 = client.post(f"/api/v1/graphs/{g_id}/nodes", json={"name": "N1", "type": "T", "state": "NORMAL", "health": 1.0, "capacity": 1.0, "criticality": 0.5}).json()
        n2 = client.post(f"/api/v1/graphs/{g_id}/nodes", json={"name": "N2", "type": "T", "state": "NORMAL", "health": 1.0, "capacity": 1.0, "criticality": 0.5}).json()

        # Create a dependency
        response = client.post(f"/api/v1/graphs/{g_id}/dependencies", json={
            "source_node_id": n1["id"],
            "target_node_id": n2["id"],
            "dependency_type": "physical",
            "strength": 1.0,
            "required": True,
            "failure_propagation": 1.0
        })
        assert response.status_code == 201
        data = response.json()
        assert data["source_node_id"] == n1["id"]
        assert data["target_node_id"] == n2["id"]

        # Prevent duplicate dependency
        response2 = client.post(f"/api/v1/graphs/{g_id}/dependencies", json={
            "source_node_id": n1["id"],
            "target_node_id": n2["id"],
            "dependency_type": "logical",
            "strength": 0.5,
            "required": False,
            "failure_propagation": 0.5
        })
        assert response2.status_code == 409

        # Cleanup
        client.delete(f"/api/v1/graphs/{g_id}")

@pytest.mark.integration
class TestGraphQueriesAPI:
    def test_traversal_and_statistics(self, client: TestClient):
        g_res = client.post("/api/v1/graphs", json={"name": "Query Test", "domain": "test", "version": 1})
        g_id = g_res.json()["id"]

        n1 = client.post(f"/api/v1/graphs/{g_id}/nodes", json={"name": "N1", "type": "T", "state": "NORMAL", "health": 1.0, "capacity": 1.0, "criticality": 0.5}).json()
        n2 = client.post(f"/api/v1/graphs/{g_id}/nodes", json={"name": "N2", "type": "T", "state": "NORMAL", "health": 1.0, "capacity": 1.0, "criticality": 0.5}).json()
        client.post(f"/api/v1/graphs/{g_id}/dependencies", json={"source_node_id": n1["id"], "target_node_id": n2["id"], "dependency_type": "physical", "strength": 1.0, "required": True, "failure_propagation": 1.0})

        # Test downstream
        ds_res = client.get(f"/api/v1/graphs/{g_id}/nodes/{n1['id']}/downstream")
        assert ds_res.status_code == 200
        assert len(ds_res.json()) == 1
        assert ds_res.json()[0]["id"] == n2["id"]

        # Test statistics
        stat_res = client.get(f"/api/v1/graphs/{g_id}/statistics")
        assert stat_res.status_code == 200
        stats = stat_res.json()
        assert stats["node_count"] == 2
        assert stats["dependency_count"] == 1

        # Test validation
        val_res = client.get(f"/api/v1/graphs/{g_id}/validation")
        assert val_res.status_code == 200
        assert val_res.json()["valid"] is True

        # Cleanup
        client.delete(f"/api/v1/graphs/{g_id}")
