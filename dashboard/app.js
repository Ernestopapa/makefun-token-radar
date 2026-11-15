// Optimized dashboard app.js for Token Radar
const data = window.RADAR;
const { rows, live, excluded_counts } = data;

function renderStats() {
    document.getElementById('stats-strip').innerHTML = `
        <div class="tile">Total: ${data.total_protocols}</div>
        <div class="tile">Live: ${data.live_size}</div>
        <div class="tile">Has Token: ${excluded_counts.has_token}</div>
        <div class="tile">Trap: ${excluded_counts.trap}</div>
    `;
}

function renderBoard(displayRows = rows) {
    const tbody = document.querySelector('#board-table tbody');
    tbody.innerHTML = displayRows.map(r => `
        <tr onclick="openDetail('${r.slug}')">
            <td>${r.rank}</td>
            <td>${r.name}</td>
            <td>$${r.tvl_usd.toLocaleString()}</td>
            <td>$${r.implied_value_usd.toLocaleString()}</td>
        </tr>
    `).join('');
}

function openDetail(slug) {
    const p = rows.find(r => r.slug === slug);
    if (!p) return;
    const drawer = document.getElementById('detail-drawer');
    drawer.style.display = 'block';
    drawer.innerHTML = `
        <button onclick="document.getElementById('detail-drawer').style.display='none'">Close</button>
        <h2>${p.name}</h2>
        <p>TVL: $${p.tvl_usd.toLocaleString()}</p>
        <p>Implied Value: $${p.implied_value_usd.toLocaleString()}</p>
        <h3>Farm Plan</h3>
        <ul>${p.farm_steps.map(s => `<li>${s}</li>`).join('')}</ul>
    `;
}

// Add filtering functionality
function filterBoard(query) {
    const filteredRows = rows.filter(r => 
        r.name.toLowerCase().includes(query.toLowerCase())
    );
    renderBoard(filteredRows);
}
document.getElementById('controls').innerHTML = `
    <input type="text" id="search-input" placeholder="Search..." oninput="filterBoard(this.value)">
`;
// Initial render
renderStats();
renderBoard();

// Handle hash for screenshots
if (window.location.hash === '#detail') {
    openDetail(rows[0].slug);
} else if (window.location.hash === '#filter') {
    filterBoard('Steakhouse');
}

// Need to add window.openDetail
window.openDetail = openDetail;
window.filterBoard = filterBoard;
