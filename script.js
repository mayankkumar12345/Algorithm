const grid = document.getElementById('grid');
const edgeLayer = document.getElementById('edgeLayer');
const pathCostEl = document.getElementById('path-cost');
const bridgeCountEl = document.getElementById('bridge-count');

let nodes = {}, edges = [], selected = [];
let edgeMode = false;
let undoStack = [], redoStack = [];

window.addEventListener('resize', () => {
  clearTimeout(this._resizeTimeout);
  this._resizeTimeout = setTimeout(drawGrid, 300);
});

document.getElementById('line-tool').onclick = () => edgeMode = !edgeMode;
document.getElementById('clear-btn').onclick = resetAll;
document.getElementById('run-btn').onclick = runAlgorithm;
document.getElementById('undo-btn').onclick = undo;
document.getElementById('redo-btn').onclick = redo;

drawGrid();

function drawGrid() {
  grid.innerHTML = '';
  edgeLayer.innerHTML = '';
  nodes = {};
  edges = [];
  undoStack = [];
  redoStack = [];
  const cols = Math.floor(grid.clientWidth / 42);
  const rows = Math.floor(grid.clientHeight / 42);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const id = `${r}-${c}`;
      const div = document.createElement('div');
      div.className = 'node'; div.id = id; div.innerText = id;
      div.onclick = () => clickNode(id);
      grid.appendChild(div);
      nodes[id] = { id, r, c, x: 0, y: 0, neighbors: {} };
    }
  }
  setTimeout(calcCenters, 0);
}

function calcCenters() {
  for (let id in nodes) {
    const el = document.getElementById(id).getBoundingClientRect();
    const svgRect = edgeLayer.getBoundingClientRect();
    nodes[id].x = el.left + el.width / 2 - svgRect.left;
    nodes[id].y = el.top + el.height / 2 - svgRect.top;
  }
}

function clickNode(id) {
  if (!edgeMode) return;
  const el = document.getElementById(id);
  el.classList.toggle('selected');
  if (!selected.includes(id)) selected.push(id);
  if (selected.length === 2) addEdge(...selected.splice(0, 2));
}

function addEdge(a, b) {
  const w = prompt(`Edge weight (${a}→${b}):`, "1");
  const weight = parseFloat(w);
  if (isNaN(weight)) return;

  nodes[a].neighbors[b] = weight;
  nodes[b].neighbors[a] = weight;
  const edgeObj = { n1: a, n2: b, w: weight };
  edges.push(edgeObj);
  undoStack.push({ type: 'add', edge: edgeObj });
  redoStack = [];

  drawEdge(a, b, weight);
  document.getElementById(a).classList.add('edge');
  document.getElementById(b).classList.add('edge');
}

function drawEdge(a, b, w, isBridge = false) {
  const { x: x1, y: y1 } = nodes[a];
  const { x: x2, y: y2 } = nodes[b];
  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", x1); line.setAttribute("y1", y1);
  line.setAttribute("x2", x2); line.setAttribute("y2", y2);
  line.setAttribute("stroke", isBridge ? "red" : "black");
  line.setAttribute("stroke-width", isBridge ? 2 : 1);
  edgeLayer.appendChild(line);

  const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
  label.setAttribute("x", (x1 + x2) / 2);
  label.setAttribute("y", (y1 + y2) / 2 - 5);
  label.setAttribute("class", "edge-label");
  label.textContent = w;
  edgeLayer.appendChild(label);
}

async function runAlgorithm() {
  const algo = document.getElementById('algorithm-select').value;
  pathCostEl.textContent = '–';
  bridgeCountEl.textContent = '–';

  if (algo === 'dijkstra') return await runShortestPath();
  if (algo === 'bridges') return runBridgeFinder();
}

async function runShortestPath() {
  const input = prompt("Enter start and end node (e.g. 0-0,3-4):");
  if (!input) return;
  const [start, end] = input.split(',').map(s => s.trim());
  if (!nodes[start] || !nodes[end]) return alert("Invalid node(s)");

  const { dist, prev } = dijkstra(start, end);
  if (dist[end] === Infinity) {
    alert("No path found.");
    pathCostEl.textContent = '∞';
    return;
  }

  pathCostEl.textContent = dist[end];
  let cur = end, path = [];
  while (cur) {
    path.unshift(cur);
    cur = prev[cur];
  }

  for (let i = 0; i < path.length; i++) {
    await new Promise(r => setTimeout(r, 1000));
    document.getElementById(path[i]).classList.add('path');
  }
}

function dijkstra(start, end) {
  const dist = {}, prev = {}, q = new Set(Object.keys(nodes));
  for (let id in nodes) { dist[id] = Infinity; prev[id] = null; }
  dist[start] = 0;

  while (q.size) {
    let u = [...q].reduce((a, b) => dist[a] < dist[b] ? a : b);
    q.delete(u);
    if (u === end) break;
    for (let v in nodes[u].neighbors) {
      if (!q.has(v)) continue;
      const alt = dist[u] + nodes[u].neighbors[v];
      if (alt < dist[v]) {
        dist[v] = alt;
        prev[v] = u;
      }
    }
  }
  return { dist, prev };
}

function runBridgeFinder() {
  const bridges = findBridges();
  redrawEdges();
  for (let [u, v] of bridges) {
    drawEdge(u, v, nodes[u].neighbors[v], true);
  }
  bridgeCountEl.textContent = bridges.length;
}

function findBridges() {
  let time = 0;
  const visited = {}, tin = {}, low = {};
  const bridges = [];

  const dfs = (u, parent) => {
    visited[u] = true;
    tin[u] = low[u] = time++;
    for (let v in nodes[u].neighbors) {
      if (v === parent) continue;
      if (!visited[v]) {
        dfs(v, u);
        low[u] = Math.min(low[u], low[v]);
        if (low[v] > tin[u]) {
          bridges.push([u, v]);
        }
      } else {
        low[u] = Math.min(low[u], tin[v]);
      }
    }
  };

  for (let id in nodes) {
    if (!visited[id]) dfs(id, null);
  }

  return bridges;
}

function resetAll() {
  drawGrid();
  pathCostEl.textContent = '–';
  bridgeCountEl.textContent = '–';
}

function undo() {
  if (!undoStack.length) return;
  const action = undoStack.pop();
  if (action.type === 'add') {
    const { n1, n2 } = action.edge;
    delete nodes[n1].neighbors[n2];
    delete nodes[n2].neighbors[n1];
    edges = edges.filter(e => !(e.n1 === n1 && e.n2 === n2) && !(e.n1 === n2 && e.n2 === n1));
    redoStack.push(action);
    redrawEdges();
    refreshNodeClasses();
  }
}

function redo() {
  if (!redoStack.length) return;
  const action = redoStack.pop();
  if (action.type === 'add') {
    const { n1, n2, w } = action.edge;
    nodes[n1].neighbors[n2] = w;
    nodes[n2].neighbors[n1] = w;
    edges.push({ n1, n2, w });
    undoStack.push(action);
    drawEdge(n1, n2, w);
    document.getElementById(n1).classList.add('edge');
    document.getElementById(n2).classList.add('edge');
  }
}

function redrawEdges() {
  edgeLayer.innerHTML = '';
  calcCenters();
  for (let e of edges) {
    drawEdge(e.n1, e.n2, e.w);
  }
}

function refreshNodeClasses() {
  document.querySelectorAll('.node').forEach(n => n.classList.remove('edge'));
  edges.forEach(e => {
    document.getElementById(e.n1)?.classList.add('edge');
    document.getElementById(e.n2)?.classList.add('edge');
  });
}
