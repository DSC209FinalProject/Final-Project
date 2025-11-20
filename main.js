import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

let allSongs = [];
let compareMode = false;
let selectedMonths = [];

/* ------------------------------- LOAD DATA ------------------------------ */

async function loadData() {
    const dataset = await d3.csv("./data/spotify-2023.csv", d => ({
        track: d["track_name"],
        artist: d["artist(s)_name"],
        released_month: +d["released_month"],
        streams: +d["streams"],
        in_spotify_playlists: +d["in_spotify_playlists"],
        danceability: +d["danceability_%"],
        energy: +d["energy_%"],
        valence: +d["valence_%"],
        acousticness: +d["acousticness_%"],
        instrumentalness: +d["instrumentalness_%"],
        liveness: +d["liveness_%"],
        speechiness: +d["speechiness_%"]
    }));
    return dataset;
}

function countSongs(data) {
    const songCounts = new Array(12).fill(0);
    data.forEach(d => songCounts[d.released_month - 1]++);
    return songCounts.map((count, i) => ({
        month: i + 1,
        count
    }));
}

/* ---------------------------- COMPUTE STATS ----------------------------- */

function computeStats(songs) {
    return {
        danceability: d3.mean(songs, d => d.danceability),
        energy: d3.mean(songs, d => d.energy),
        valence: d3.mean(songs, d => d.valence),
        acousticness: d3.mean(songs, d => d.acousticness),
        instrumentalness: d3.mean(songs, d => d.instrumentalness),
        liveness: d3.mean(songs, d => d.liveness),
        speechiness: d3.mean(songs, d => d.speechiness)
    };
}

/* ---------------------------- PIE CHART ---------------------------- */

function renderGraph(data) {
    const width = 1000, height = 1000;
    const svg = d3.select('#chart')
        .append('svg')
        .attr('viewBox', `-150 -150 ${width + 300} ${height + 300}`)
        .style('width', '100%');

    const container = svg.append('g')
        .attr('transform', `translate(${width / 2}, ${height / 2})`);

    const pie = d3.pie().value(d => d.count);
    const slices = pie(data);

    const radius = width / 2;
    const arc = d3.arc().innerRadius(0).outerRadius(radius);
    const color = d3.schemeTableau10;

    container.selectAll("path")
        .data(slices)
        .enter()
        .append("path")
        .attr("d", arc)
        .attr("fill", (d, i) => color[i])
        .attr("stroke", "black")
        .attr("stroke-width", 2)
        .style("cursor", "pointer")
        .on("click", (event, d) => handleMonthClick(d.data.month));

    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

    const labelArc = d3.arc()
        .innerRadius(radius * 0.93)
        .outerRadius(radius * 1.12);

    container.selectAll(".pie-label")
        .data(slices)
        .enter()
        .append("text")
        .attr("class", "pie-label")
        .attr("transform", d => `translate(${labelArc.centroid(d)})`)
        .attr("text-anchor", "middle")
        .attr("dy", "0.35em")
        .style("font-size", "3rem")
        .style("fill", "#f5f5f7")
        .style("font-weight", "600")
        .text(d => monthNames[d.data.month - 1]);
}

/* ---------------------- CLICK LOGIC (COMPARISON MODE) ---------------------- */

function handleMonthClick(month) {
    if (!compareMode) {
        updateMonthOverview(month);
        updateRadarChart(month);
        return;
    }

    selectedMonths.push(month);
    selectedMonths = [...new Set(selectedMonths)];

    if (selectedMonths.length === 1) {
        d3.select("#compare-status").text(`Selected: ${selectedMonths[0]} — choose another month`);
    }

    if (selectedMonths.length === 2) {
        d3.select("#compare-status").text(`Comparing: ${selectedMonths[0]} vs ${selectedMonths[1]}`);
        radarGroup.selectAll(".compare-shape").remove();
        updateComparisonCharts(selectedMonths[0], selectedMonths[1]);
    }
}

/* ------------------------- COMPARE MONTHS -------------------------- */

function updateComparisonCharts(monthA, monthB) {
    const songsA = allSongs.filter(d => d.released_month === monthA);
    const songsB = allSongs.filter(d => d.released_month === monthB);

    const statsA = computeStats(songsA);
    const statsB = computeStats(songsB);

    radarGroup.append("path")
        .attr("class", "compare-shape")
        .attr("d", radarPath(statsA))
        .attr("fill", "rgba(255, 145, 164, 0.4)")
        .attr("stroke", "#ff6384")
        .attr("stroke-width", 2);

    radarGroup.append("path")
        .attr("class", "compare-shape")
        .attr("d", radarPath(statsB))
        .attr("fill", "rgba(79, 140, 255, 0.4)")
        .attr("stroke", "#4f8cff")
        .attr("stroke-width", 2);

    renderLineComparison(monthA, monthB);
}

/* ---------------------------- SUMMARY PANEL ---------------------------- */

function updateMonthOverview(selectedMonth) {
    const container = d3.select("#month-summary");

    const monthSongs = allSongs.filter(d => d.released_month === selectedMonth);
    const avgStreams = d3.mean(monthSongs, d => d.streams);
    const totalStreams = d3.sum(monthSongs, d => d.streams);
    const topSong = monthSongs.reduce((max, s) => s.streams > max.streams ? s : max);

    const monthName = [
        "January","February","March","April","May","June",
        "July","August","September","October","November","December"
    ][selectedMonth - 1];

    container.html(`
        <h3>${monthName}</h3>
        <div><strong>${monthSongs.length}</strong> songs released</div>
        <div><strong>${(totalStreams / 1e6).toFixed(1)}M</strong> total streams</div>
        <div>Avg streams: <strong>${(avgStreams / 1e6).toFixed(1)}M</strong></div>
        <div><strong>Top song:</strong> ${topSong.track} – ${topSong.artist}</div>
    `);
}

/* ---------------------------- RADAR CHART ---------------------------- */

let radarSvg, radarGroup;
const radarSize = 400, radarRadius = 160;

function initRadarChart() {
    radarSvg = d3.select("#radar-chart")
        .append("svg")
        .attr("width", radarSize)
        .attr("height", radarSize);

    radarGroup = radarSvg.append("g")
        .attr("transform", `translate(${radarSize/2}, ${radarSize/2})`);

    const levels = [25, 50, 75, 100];
    levels.forEach(level => {
        radarGroup.append("circle")
            .attr("r", radarRadius * (level / 100))
            .attr("fill", "none")
            .attr("stroke", "#444")
            .attr("stroke-width", 0.7);
    });

    const features = ["Dance","Energy","Valence","Acoustic","Instr.","Liveness","Speech"];
    features.forEach((feat, i) => {
        const angle = (Math.PI * 2) / features.length;
        const x = Math.cos(i * angle - Math.PI/2) * (radarRadius + 12);
        const y = Math.sin(i * angle - Math.PI/2) * (radarRadius + 12);

        radarGroup.append("text")
            .attr("x", x)
            .attr("y", y)
            .attr("text-anchor", "middle")
            .style("fill", "#fff")
            .style("font-size", "0.75rem")
            .text(feat);
    });
}

function radarPath(stats) {
    const features = [
        stats.danceability,
        stats.energy,
        stats.valence,
        stats.acousticness,
        stats.instrumentalness,
        stats.liveness,
        stats.speechiness
    ];

    const angleSlice = (Math.PI * 2) / features.length;
    const rScale = d3.scaleLinear().domain([0, 100]).range([0, radarRadius]);

    return d3.lineRadial()
        .radius(d => rScale(d))
        .angle((d, i) => i * angleSlice)
        .curve(d3.curveCardinalClosed)(features);
}

function updateRadarChart(selectedMonth) {
    const songs = allSongs.filter(d => d.released_month === selectedMonth);
    const stats = computeStats(songs);

    radarGroup.selectAll(".month-shape").remove();

    radarGroup.append("path")
        .attr("class", "month-shape")
        .attr("d", radarPath(stats))
        .attr("fill", "rgba(79, 140, 255, 0.4)")
        .attr("stroke", "#b3c6ff")
        .attr("stroke-width", 2);
}

/* ---------------------------- INIT ---------------------------- */

allSongs = await loadData();
renderGraph(countSongs(allSongs));
initRadarChart();

// Toggle compare mode
document.getElementById("compare-toggle").addEventListener("change", (e) => {
    compareMode = e.target.checked;
    selectedMonths = [];
    d3.select("#compare-status").text(compareMode ? "Select two months..." : "");
});