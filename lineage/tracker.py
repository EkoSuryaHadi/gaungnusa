"""
Gaung V3 — OpenLineage-inspired Data Lineage Tracker
Tracks: Source → Bronze → Silver → Gold with full metadata
Stores lineage events in DuckDB for querying and visualization
"""
import json
import hashlib
from datetime import datetime, timezone
from typing import Optional

import duckdb

DB_PATH = "/home/ubuntu/gaung_v3/gaung.db"


def init_lineage_db():
    """Initialize the lineage tracking tables"""
    con = duckdb.connect(DB_PATH)
    con.execute("""
        CREATE TABLE IF NOT EXISTS _lineage_events (
            event_id VARCHAR PRIMARY KEY,
            event_type VARCHAR,
            event_time TIMESTAMP,
            run_id VARCHAR,
            job_name VARCHAR,
            inputs JSON,
            outputs JSON,
            metadata JSON
        )
    """)
    con.execute("""
        CREATE TABLE IF NOT EXISTS _lineage_nodes (
            node_id VARCHAR PRIMARY KEY,
            node_type VARCHAR,
            node_name VARCHAR,
            layer VARCHAR,
            schema_info JSON,
            created_at TIMESTAMP,
            parent_nodes JSON
        )
    """)
    con.close()


def create_lineage_event(
    event_type: str,
    run_id: str,
    job_name: str,
    inputs: list[dict],
    outputs: list[dict],
    metadata: Optional[dict] = None,
) -> str:
    """Emit an OpenLineage-style event"""
    con = duckdb.connect(DB_PATH)
    
    event_id = hashlib.md5(
        f"{run_id}|{event_type}|{json.dumps(inputs)}|{json.dumps(outputs)}".encode()
    ).hexdigest()[:16]
    
    con.execute(f"""
        INSERT INTO _lineage_events VALUES (
            '{event_id}',
            '{event_type}',
            '{datetime.now(timezone.utc).isoformat()}',
            '{run_id}',
            '{job_name}',
            '{json.dumps(inputs)}',
            '{json.dumps(outputs)}',
            '{json.dumps(metadata or {})}'
        )
        ON CONFLICT DO NOTHING
    """)
    
    # Update lineage nodes
    for inp in inputs:
        con.execute(f"""
            INSERT INTO _lineage_nodes (node_id, node_type, node_name, layer, created_at)
            VALUES ('{inp.get("id", "unknown")}', 'dataset', '{inp.get("name", "unknown")}', '{inp.get("layer", "unknown")}', NOW())
            ON CONFLICT DO NOTHING
        """)
    
    for out in outputs:
        con.execute(f"""
            INSERT INTO _lineage_nodes (node_id, node_type, node_name, layer, created_at, parent_nodes)
            VALUES (
                '{out.get("id", "unknown")}', 'dataset', '{out.get("name", "unknown")}',
                '{out.get("layer", "unknown")}', NOW(),
                '{json.dumps([i.get("id") for i in inputs])}'
            )
            ON CONFLICT (node_id) DO UPDATE SET parent_nodes = '{json.dumps([i.get("id") for i in inputs])}'
        """)
    
    con.close()
    return event_id


def get_lineage_graph() -> dict:
    """Get full lineage graph for visualization"""
    con = duckdb.connect(DB_PATH)
    
    nodes = con.execute("""
        SELECT node_id, node_type, node_name, layer, parent_nodes, schema_info
        FROM _lineage_nodes ORDER BY layer, node_name
    """).fetchall()
    
    events = con.execute("""
        SELECT event_id, event_type, event_time, job_name, inputs, outputs
        FROM _lineage_events ORDER BY event_time DESC
    """).fetchall()
    
    con.close()
    
    graph = {"nodes": [], "edges": [], "events": []}
    
    for n in nodes:
        graph["nodes"].append({
            "id": n[0], "type": n[1], "name": n[2],
            "layer": n[3], "parents": json.loads(n[4] or "[]"),
            "schema": json.loads(n[5] or "{}"),
        })
    
    for n in nodes:
        parents = json.loads(n[4] or "[]")
        for p in parents:
            graph["edges"].append({"from": p, "to": n[0]})
    
    for e in events:
        graph["events"].append({
            "id": e[0], "type": e[1], "time": e[2],
            "job": e[3], "inputs": json.loads(e[4]),
            "outputs": json.loads(e[5]),
        })
    
    return graph


def visualize_lineage() -> str:
    """Generate ASCII lineage visualization"""
    graph = get_lineage_graph()
    
    lines = [
        "═══════════════════════════════════════════",
        "        GAUNG V3 — DATA LINEAGE",
        "═══════════════════════════════════════════",
        "",
    ]
    
    # Layer-based grouping
    layers = {}
    for n in graph["nodes"]:
        layer = n.get("layer", "unknown")
        layers.setdefault(layer, []).append(n)
    
    layer_order = ["source", "bronze", "silver", "gold"]
    layer_icons = {"source": "📁", "bronze": "🥉", "silver": "🥈", "gold": "🥇"}
    
    for layer in layer_order:
        if layer in layers:
            icon = layer_icons.get(layer, "📊")
            lines.append(f"\n{icon} {layer.upper()} LAYER:")
            for n in layers[layer]:
                parents = " ← ".join([p for p in n.get("parents", [])]) or "none"
                lines.append(f"   ├─ {n['name']}")
                lines.append(f"   │  Parents: {parents}")
    
    lines.append(f"\n{'─'*40}")
    lines.append(f"Total Nodes: {len(graph['nodes'])}")
    lines.append(f"Total Edges: {len(graph['edges'])}")
    lines.append(f"Total Events: {len(graph['events'])}")
    lines.append(f"Latest Event: {graph['events'][0]['time'] if graph['events'] else 'none'}")
    
    return "\n".join(lines)


def track_bronze_ingest(run_id: str, source_name: str, parquet_path: str, columns: list):
    """Track a Bronze ingest event"""
    return create_lineage_event(
        event_type="BRONZE_INGEST",
        run_id=run_id,
        job_name="bronze_iot_data",
        inputs=[{"id": f"upload:{source_name}", "name": f"{source_name}.csv", "layer": "source"}],
        outputs=[{
            "id": f"bronze:{source_name}", "name": f"{source_name}.parquet",
            "layer": "bronze", "path": parquet_path,
        }],
        metadata={"columns": columns, "format": "parquet", "compression": "snappy"},
    )


def track_silver_transform(run_id: str, source_name: str, row_count: int):
    """Track a Silver dbt transformation"""
    return create_lineage_event(
        event_type="SILVER_TRANSFORM",
        run_id=run_id,
        job_name="silver_iot_data",
        inputs=[{"id": f"bronze:{source_name}", "name": f"{source_name}.parquet", "layer": "bronze"}],
        outputs=[{
            "id": f"silver:{source_name}", "name": f"{source_name}_silver",
            "layer": "silver", "row_count": row_count, "strategy": "SCD_Type_2",
        }],
    )


def track_gold_aggregate(run_id: str, source_name: str, models: list[str]):
    """Track Gold aggregation events"""
    events = []
    for model in models:
        eid = create_lineage_event(
            event_type="GOLD_AGGREGATE",
            run_id=run_id,
            job_name="gold_iot_data",
            inputs=[{"id": f"silver:{source_name}", "name": f"{source_name}_silver", "layer": "silver"}],
            outputs=[{"id": f"gold:{model}", "name": model, "layer": "gold", "strategy": "incremental"}],
        )
        events.append(eid)
    return events
