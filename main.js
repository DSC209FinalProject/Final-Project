import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

let allSongs = [];
let compareMode = false;
let selectedMonths = [];


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

//metric computation

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

//pie chart

function renderGraph(data) {
    const width = 900, height = 900;

    const svg = d3.select('#chart')
        .append('svg')
        .attr('viewBox', `-50 -50 ${width + 100} ${height + 100}`)
        .style('width', '100%');

    const container = svg.append('g')
        .attr('transform', `translate(${width / 2}, ${height / 2})`);

    const pie = d3.pie()
        .value(d => d.count)
        .sort(null);
    const slices = pie(data);

    const radius = width / 2;
    const arc = d3.arc().innerRadius(0).outerRadius(radius);
    const baseColors = d3.schemePaired;
    const color = baseColors.map(c => {
        const hsl = d3.hsl(c);
        hsl.s *= 0.5;
        hsl.l *= 0.7;
        return hsl.toString();
    });

    container.selectAll("path")
        .data(slices)
        .enter()
        .append("path")
        .attr("d", arc)
        .attr("fill", (d, i) => color[i])
        .attr("stroke", "#1a1a1a")
        .attr("stroke-width", 2)
        .style("cursor", "pointer")

        //back hover interaction
        .on("mouseover", function (event, d) {
            const [x, y] = arc.centroid(d);
            d3.select(this)
                .transition()
                .duration(150)
                .attr("transform", `translate(${x * 0.08}, ${y * 0.08})`);
        })
        .on("mouseout", function () {
            d3.select(this)
                .transition()
                .duration(200)
                .attr("transform", "translate(0,0)");
        })

        .on("click", (event, d) => handleMonthClick(d.data.month));

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const labelArc = d3.arc().innerRadius(radius * 1.01).outerRadius(radius * 1.05);

    container.selectAll(".pie-label")
        .data(slices)
        .enter()
        .append("text")
        .attr("class", "pie-label")
        .attr("transform", d => `translate(${labelArc.centroid(d)})`)
        .attr("text-anchor", "middle")
        .style("font-size", "3rem")
        .style("fill", "#ffffff")
        .style("font-weight", "600")
        .text(d => monthNames[d.data.month - 1]);
}

//click logic

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

//compare month

function updateComparisonCharts(monthA, monthB) {
    const songsA = allSongs.filter(d => d.released_month === monthA);
    const songsB = allSongs.filter(d => d.released_month === monthB);

    const statsA = computeStats(songsA);
    const statsB = computeStats(songsB);

    radarGroup.append("path")
        .attr("class", "compare-shape")
        .attr("d", radarPath(statsA))
        .attr("fill", "rgba(255, 145, 164, 0.4)")
        .attr("stroke", "#ff6384");

    radarGroup.append("path")
        .attr("class", "compare-shape")
        .attr("d", radarPath(statsB))
        .attr("fill", "rgba(79, 140, 255, 0.4)")
        .attr("stroke", "#4f8cff");
}

//summary panel

function updateMonthOverview(selectedMonth) {
    const container = d3.select("#month-summary");

    const monthSongs = allSongs.filter(d => d.released_month === selectedMonth);
    const avgStreams = d3.mean(monthSongs, d => d.streams);
    const totalStreams = d3.sum(monthSongs, d => d.streams);
    const topSong = monthSongs.reduce((max, s) => s.streams > max.streams ? s : max);

    const monthName = [
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December"
    ][selectedMonth - 1];

    container.html(`
        <h3>${monthName}</h3>
        <div><strong>${monthSongs.length}</strong> songs released</div>
        <div><strong>${(totalStreams / 1e6).toFixed(1)}M</strong> total streams</div>
        <div>Avg streams: <strong>${(avgStreams / 1e6).toFixed(1)}M</strong></div>
        <div><strong>Top song:</strong> ${topSong.track} – ${topSong.artist}</div>
    `);
}

//radar chart

let radarSvg, radarGroup;
const radarSize = 400, radarRadius = 160;

function initRadarChart() {
    const width = 450;
    const height = 500;
    const radius = 210;

    radarSvg = d3.select("#radar-chart")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .style("width", "100%")
        .style("max-width", "450px");

    radarGroup = radarSvg.append("g")
        .attr("transform", `translate(${width / 2}, ${height / 2})`);

    const levels = [25, 50, 75, 100];
    levels.forEach(level => {
        radarGroup.append("circle")
            .attr("class", "radar-grid")
            .attr("r", radius * (level / 100));
    });

    const features = ["Dance", "Energy", "Valence", "Acoustic", "Instr.", "Liveness", "Speech"];
    const angle = (Math.PI * 2) / features.length;

    features.forEach((feat, i) => {
        const x = Math.cos(i * angle - Math.PI / 2) * (radius + 12);
        const y = Math.sin(i * angle - Math.PI / 2) * (radius + 12);

        radarGroup.append("text")
            .attr("class", "radar-axis-label")
            .attr("x", x)
            .attr("y", y)
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
        .attr("stroke", "#b3c6ff");
}

// Line Graph
function renderLineGraph() {
    const width = 1200;
    const height = 600;
    const margin = { top: 0, right: 40, bottom: 80, left: 80 };

    const usableArea = {
        top: margin.top,
        right: width - margin.right,
        bottom: height - margin.bottom,
        left: margin.left,
        width: width - margin.left - margin.right,
        height: height - margin.top - margin.bottom,
    };

    const monthlyData = d3.range(1, 13).map(month => {
        const songs = allSongs.filter(d => d.released_month === month);
        return {
            month,
            danceability: d3.mean(songs, d => d.danceability),
            energy: d3.mean(songs, d => d.energy),
            valence: d3.mean(songs, d => d.valence),
            acousticness: d3.mean(songs, d => d.acousticness),
            instrumentalness: d3.mean(songs, d => d.instrumentalness),
            liveness: d3.mean(songs, d => d.liveness),
            speechiness: d3.mean(songs, d => d.speechiness)
        };
    });

    const svg = d3.select('#linegraph')
        .append('svg')
        .attr('viewBox', `0 0 ${width} ${height}`)
        .attr('preserveAspectRatio', 'xMinYMin')
        .style('width', '100%')
        .style('max-width', '1200px')
        .style('overflow', 'visible');

    const xScale = d3.scaleLinear()
        .domain([1, 12])
        .range([usableArea.left, usableArea.right]);

    const yScale = d3.scaleLinear()
        .domain([0, 100])
        .range([usableArea.bottom, usableArea.top]);

    const gridlines = svg.append('g')
        .attr('class', 'gridlines')
        .attr('transform', `translate(${usableArea.left}, 0)`);

    gridlines.call(d3.axisLeft(yScale)
        .tickSize(-usableArea.width)
        .tickFormat(''));

    const xAxis = d3.axisBottom(xScale)
        .ticks(12)
        .tickFormat(d => ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d - 1]);

    const yAxis = d3.axisLeft(yScale);

    let xAxisGroup = svg.append('g')
        .attr('class', 'x-axis')
        .attr('transform', `translate(0, ${usableArea.bottom})`)
        .call(xAxis);

    xAxisGroup.selectAll('text')
        .style('font-size', '14px')
        .style('fill', '#ffffffff');

    const yAxisGroup = svg.append('g')
        .attr('class', 'y-axis')
        .attr('transform', `translate(${usableArea.left}, 0)`)
        .call(yAxis);

    yAxisGroup.selectAll('text')
        .style('font-size', '14px')
        .style('fill', '#ffffffff');

    svg.append('text')
        .attr('text-anchor', 'middle')
        .attr('x', d3.mean([usableArea.left, usableArea.right]))
        .attr('y', height - 20)
        .style('font-size', '16px')
        .style('fill', '#ffffffff')
        .text('Month');

    svg.append('text')
        .attr('text-anchor', 'middle')
        .attr('transform', 'rotate(-90)')
        .attr('x', -d3.mean([usableArea.top, usableArea.bottom]))
        .attr('y', usableArea.left - 50)
        .style('font-size', '16px')
        .style('fill', '#ffffffff')
        .text('Mean Percentage');

    const line = d3.line()
        .x(d => xScale(d.month))
        .y(d => yScale(d.value))
        .curve(d3.curveMonotoneX);

    const features = [
        { key: 'danceability', label: 'Danceability', color: '#1f77b4' },
        { key: 'energy', label: 'Energy', color: '#ff7f0e' },
        { key: 'valence', label: 'Valence (0=moody, 100=positive)', color: '#2ca02c' },
        { key: 'acousticness', label: 'Acousticness', color: '#d62728' },
        { key: 'instrumentalness', label: 'Instrumentalness', color: '#9467bd' },
        { key: 'liveness', label: 'Liveness', color: '#8c564b' },
        { key: 'speechiness', label: 'Speechiness', color: '#e377c2' }
    ];

    features.forEach(feature => {
        const lineData = monthlyData.map(d => ({
            month: d.month,
            value: d[feature.key]
        }));

        svg.append('path')
            .datum(lineData)
            .attr('class', `line-${feature.key}`)
            .attr('fill', 'none')
            .attr('stroke', feature.color)
            .attr('stroke-width', 2)
            .attr('d', line);

        svg.selectAll(`.dot-${feature.key}`)
            .data(lineData)
            .enter()
            .append('circle')
            .attr('class', `dot-${feature.key}`)
            .attr('cx', d => xScale(d.month))
            .attr('cy', d => yScale(d.value))
            .attr('r', 6)
            .attr('fill', feature.color)
            .attr('stroke', '#000000ff')
            .attr('stroke-width', 1);
    });
}

allSongs = await loadData();
renderGraph(countSongs(allSongs));
initRadarChart();
renderLineGraph();

document.getElementById("compare-toggle").addEventListener("change", (e) => {
    compareMode = e.target.checked;
    selectedMonths = [];
    d3.select("#compare-status").text(compareMode ? "Select two months..." : "");
});