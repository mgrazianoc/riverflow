"""
Server-side DAG graph layout.

Pure-Python topological layout engine — no external dependency.
Assigns (x, y) positions to DAGNodeModel nodes so templates can
render them with absolute CSS positioning.  Zero client-side JS needed.

Algorithm:
  1. Topological sort via Kahn's algorithm → assign "rank" (column).
  2. Within each rank, space nodes evenly (row).
  3. Direction: left-to-right (rank = x-axis, order = y-axis).
"""

from __future__ import annotations

from collections import deque

from ..models.dag import DAGGraphModel

# ── Layout constants ─────────────────────────

NODE_W = 180          # default node width (px)
NODE_H = 66           # default node height (px)
RANK_SEP = 100        # horizontal gap between ranks
NODE_SEP = 28         # vertical gap between nodes in same rank
MARGIN_X = 24         # left/top margin
MARGIN_Y = 24


def layout_dag_graph(graph: DAGGraphModel) -> DAGGraphModel:
    """Compute (x, y) for every node and set graph_width / graph_height."""
    if not graph.nodes:
        return graph

    node_ids = {n.id for n in graph.nodes}

    # Build adjacency + in-degree
    children: dict[str, list[str]] = {nid: [] for nid in node_ids}
    in_degree: dict[str, int] = {nid: 0 for nid in node_ids}

    for edge in graph.edges:
        if edge.source in node_ids and edge.target in node_ids:
            children[edge.source].append(edge.target)
            in_degree[edge.target] += 1

    # Kahn's algorithm → rank assignment
    rank: dict[str, int] = {}
    queue: deque[str] = deque()
    for nid in node_ids:
        if in_degree[nid] == 0:
            queue.append(nid)
            rank[nid] = 0

    while queue:
        nid = queue.popleft()
        for child in children[nid]:
            # Longest path ranking (looks better for DAGs)
            rank[child] = max(rank.get(child, 0), rank[nid] + 1)
            in_degree[child] -= 1
            if in_degree[child] == 0:
                queue.append(child)

    # Fallback for any unranked nodes (shouldn't happen in a DAG)
    max_rank = max(rank.values()) if rank else 0
    for nid in node_ids:
        if nid not in rank:
            max_rank += 1
            rank[nid] = max_rank

    # Group nodes by rank, sort within rank for stability
    ranks: dict[int, list[str]] = {}
    for nid, r in rank.items():
        ranks.setdefault(r, []).append(nid)
    for r in ranks:
        ranks[r].sort()

    # Assign positions
    node_map = {n.id: n for n in graph.nodes}
    max_x = 0.0
    max_y = 0.0

    for r in sorted(ranks):
        nodes_in_rank = ranks[r]
        x = MARGIN_X + r * (NODE_W + RANK_SEP)

        for i, nid in enumerate(nodes_in_rank):
            y = MARGIN_Y + i * (NODE_H + NODE_SEP)
            node = node_map[nid]
            node.x = x
            node.y = y
            node.width = NODE_W
            node.height = NODE_H
            max_x = max(max_x, x + NODE_W)
            max_y = max(max_y, y + NODE_H)

    graph.graph_width = max_x + MARGIN_X
    graph.graph_height = max_y + MARGIN_Y

    return graph
