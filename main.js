import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7/+esm';

let allSongs = [];
let compareMode = false;
let selectedMonths = [];
let showAverage = false;
let currentSelectedMonth = null;
let pieSlices = null;

let radarSvg, radarGroup;
const radarSize = 400, radarRadius = 160;

// list of features used in the line graph + artist section.
const FEATURES = [
    { key: 'danceability', label: 'Danceability', color: '#1f77b4' },
    { key: 'energy', label: 'Energy', color: '#ff7f0e' },
    { key: 'valence', label: 'Valence', color: '#2ca02c' },
    { key: 'acousticness', label: 'Acousticness', color: '#d62728' },
    { key: 'instrumentalness', label: 'Instrumentalness', color: '#9467bd' },
    { key: 'liveness', label: 'Liveness', color: '#8c564b' },
    { key: 'speechiness', label: 'Speechiness', color: '#e377c2' }
];

// line graph visibility state.
let activeFeatureKeys = FEATURES.map(f => f.key);

// store precomputed monthly averages for the line graph.
let monthlyFeatureData = null;

// store overall 2023 averages for each feature (used for artist deltas).
let globalFeatureStats = null;

async function loadData() {
    const dataset = await d3.csv("./data/spotify-2023.csv", d => ({
        track: d["track_name"],
        artist: d["artist(s)_name"],
        released_month: +d["released_month"],
        released_day: +d["released_day"],
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
// Helper that takes a list of songs and returns mean values for all audio features.
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

    // Custom dark-mode-friendly palette: 12 distinct hues (one per month).
    const piePalette = [
        "#4e79a7", // Jan - blue
        "#f28e2b", // Feb - orange
        "#e15759", // Mar - red
        "#76b7b2", // Apr - teal
        "#59a14f", // May - green
        "#edc949", // Jun - yellow
        "#af7aa1", // Jul - purple
        "#ff9da7", // Aug - pink
        "#9c755f", // Sep - brown
        "#bab0ab", // Oct - gray
        "#6b6ecf", // Nov - indigo
        "#b6e880"  // Dec - light green
    ];

    // Expose pie colors to reuse in summary cards and radar outlines.
    window.pieColors = piePalette;

    pieSlices = container.selectAll("path")
        .data(slices)
        .enter()
        .append("path")
        .attr("d", arc)
        .attr("fill", (d, i) => window.pieColors[i])
        .attr("stroke", "#1a1a1a")
        .attr("stroke-width", 2)
        .style("cursor", "pointer")

        //back hover interaction
        .on("mouseover", function (event, d) {
            const isSelected = compareMode
                ? selectedMonths.includes(d.data.month)
                : currentSelectedMonth === d.data.month;

            if (!isSelected) {
                const [x, y] = arc.centroid(d);
                d3.select(this)
                    .transition()
                    .duration(150)
                    .attr("transform", `translate(${x * 0.08}, ${y * 0.08})`);
            }
        })
        .on("mouseout", function (event, d) {
            const isSelected = compareMode
                ? selectedMonths.includes(d.data.month)
                : currentSelectedMonth === d.data.month;

            if (!isSelected) {
                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr("transform", "translate(0,0)");
            }
        })

        .on("click", (event, d) => handleMonthClick(d.data.month, event.currentTarget));

    const monthNamesShort = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const labelArc = d3.arc().innerRadius(radius * 1.01).outerRadius(radius * 1.02);

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
        .text(d => monthNamesShort[d.data.month - 1]);
}

//click logic

const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

function handleMonthClick(month, sliceElement) {
    if (!compareMode) {
        // If clicking the same month, deselect it
        if (currentSelectedMonth === month) {
            clearSelections();
        } else {
            currentSelectedMonth = month;
            updatePieSliceSelection(month);
            updateMonthOverview(month);
            updateRadarChart(month);
        }
        return;
    }

    // In compare mode: toggle month selection
    if (selectedMonths.includes(month)) {
        // Deselect the month
        selectedMonths = selectedMonths.filter(m => m !== month);
        updateComparisonPieSlices();

        if (selectedMonths.length === 0) {
            d3.select("#compare-status").text("Select two months...");
            d3.select("#month-summary")
                .html('<p style="color: #f5f5f7; margin: 0;">Click a slice to explore that month.</p>')
                .attr("class", "");
            radarGroup.selectAll(".compare-shape").remove();
            if (showAverage) {
                drawAverageShape();
            }
        } else if (selectedMonths.length === 1) {
            const monthName = monthNames[selectedMonths[0] - 1];
            d3.select("#compare-status").text(`Selected: ${monthName} — choose another month`);
            radarGroup.selectAll(".compare-shape").remove();
            // Show the single month blob and summary
            updateSingleComparisonChart(selectedMonths[0]);
            updateMonthOverview(selectedMonths[0]);
        }
    } else {
        // Select the month
        selectedMonths.push(month);
        selectedMonths = [...new Set(selectedMonths)];

        // Limit to 2 months
        if (selectedMonths.length > 2) {
            selectedMonths.shift(); // Remove the first selected month
        }

        updateComparisonPieSlices();

        if (selectedMonths.length === 1) {
            const monthName = monthNames[selectedMonths[0] - 1];
            d3.select("#compare-status").text(`Selected: ${monthName} — choose another month`);
            radarGroup.selectAll(".compare-shape").remove();
            // Show the single month blob and summary
            updateSingleComparisonChart(selectedMonths[0]);
            updateMonthOverview(selectedMonths[0]);
        }

        if (selectedMonths.length === 2) {
            const monthName1 = monthNames[selectedMonths[0] - 1];
            const monthName2 = monthNames[selectedMonths[1] - 1];
            d3.select("#compare-status").text(`Comparing ${monthName1} vs ${monthName2} of 2023`);
            radarGroup.selectAll(".compare-shape").remove();
            updateComparisonCharts(selectedMonths[0], selectedMonths[1]);
            updateComparisonOverview(selectedMonths[0], selectedMonths[1]);
        }
    }
}

function updateComparisonPieSlices() {
    pieSlices.each(function (d) {
        const slice = d3.select(this);
        const sliceData = slice.data()[0];

        if (selectedMonths.includes(sliceData.data.month)) {
            const arc = d3.arc().innerRadius(0).outerRadius(450);
            const [x, y] = arc.centroid(sliceData);
            slice.transition()
                .duration(200)
                .attr("transform", `translate(${x * 0.08}, ${y * 0.08})`);
        } else {
            slice.transition()
                .duration(200)
                .attr("transform", "translate(0,0)");
        }
    });
}

function updatePieSliceSelection(selectedMonth) {
    pieSlices.each(function (d) {
        const slice = d3.select(this);
        const sliceData = slice.data()[0];

        if (sliceData.data.month === selectedMonth) {
            const arc = d3.arc().innerRadius(0).outerRadius(450);
            const [x, y] = arc.centroid(sliceData);
            slice.transition()
                .duration(200)
                .attr("transform", `translate(${x * 0.08}, ${y * 0.08})`);
        } else {
            slice.transition()
                .duration(200)
                .attr("transform", "translate(0,0)");
        }
    });
}

function clearSelections() {
    currentSelectedMonth = null;
    selectedMonths = [];

    pieSlices.transition()
        .duration(200)
        .attr("transform", "translate(0,0)");

    d3.select("#month-summary")
        .html('<p style="color: #f5f5f7; margin: 0;">Click a slice to explore that month.</p>')
        .attr("class", "");
    d3.select("#compare-status").text(compareMode ? "Select two months..." : "");

    radarGroup.selectAll(".month-shape").remove();
    radarGroup.selectAll(".compare-shape").remove();

    if (showAverage) {
        drawAverageShape();
    }
}

//compare month

function updateSingleComparisonChart(month) {
    const songs = allSongs.filter(d => d.released_month === month);
    const stats = computeStats(songs);

    const monthColor = window.pieColors[month - 1];
    const colorObj = d3.color(monthColor);
    const rgbaFill = `rgba(${colorObj.r}, ${colorObj.g}, ${colorObj.b}, 0.4)`;

    radarGroup.append("path")
        .attr("class", "compare-shape")
        .attr("d", radarPath(stats))
        .attr("fill", rgbaFill)
        .attr("stroke", monthColor);

    if (showAverage) {
        drawAverageShape();
    }
}

function updateComparisonCharts(monthA, monthB) {
    const songsA = allSongs.filter(d => d.released_month === monthA);
    const songsB = allSongs.filter(d => d.released_month === monthB);

    const statsA = computeStats(songsA);
    const statsB = computeStats(songsB);

    // Get colors for each month from the pie chart
    const colorA = window.pieColors[monthA - 1];
    const colorObjA = d3.color(colorA);
    const rgbaFillA = `rgba(${colorObjA.r}, ${colorObjA.g}, ${colorObjA.b}, 0.4)`;

    const colorB = window.pieColors[monthB - 1];
    const colorObjB = d3.color(colorB);
    const rgbaFillB = `rgba(${colorObjB.r}, ${colorObjB.g}, ${colorObjB.b}, 0.4)`;

    radarGroup.append("path")
        .attr("class", "compare-shape")
        .attr("d", radarPath(statsA))
        .attr("fill", rgbaFillA)
        .attr("stroke", colorA);

    radarGroup.append("path")
        .attr("class", "compare-shape")
        .attr("d", radarPath(statsB))
        .attr("fill", rgbaFillB)
        .attr("stroke", colorB);

    if (showAverage) {
        drawAverageShape();
    }
}

//summary panel

function updateMonthOverview(selectedMonth) {
    const container = d3.select("#month-summary");
    container.attr("class", "single-month");

    const monthSongs = allSongs.filter(d => d.released_month === selectedMonth);
    const avgStreams = d3.mean(monthSongs, d => d.streams);
    const totalStreams = d3.sum(monthSongs, d => d.streams);
    const topSong = monthSongs.reduce((max, s) => s.streams > max.streams ? s : max);

    const monthName = monthNames[selectedMonth - 1];

    const monthColor = window.pieColors[selectedMonth - 1];
    const colorObj = d3.hsl(monthColor);
    colorObj.l = Math.min(0.85, colorObj.l + 0.3);
    const lightColor = colorObj.toString();

    container.html(`
        <h3 style="color: ${lightColor}">${monthName}</h3>
        <div style="color: ${lightColor}"><strong>${monthSongs.length}</strong> songs released</div>
        <div style="color: ${lightColor}"><strong>${(totalStreams / 1e6).toFixed(1)}M</strong> total streams</div>
        <div style="color: ${lightColor}">Avg streams: <strong>${(avgStreams / 1e6).toFixed(1)}M</strong></div>
        <div style="color: ${lightColor}"><strong>Top song:</strong> ${topSong.track} – ${topSong.artist}</div>
    `);
}

function updateComparisonOverview(monthA, monthB) {
    const container = d3.select("#month-summary");
    container.attr("class", "compare-mode");

    const createMonthCard = (month) => {
        const monthSongs = allSongs.filter(d => d.released_month === month);
        const avgStreams = d3.mean(monthSongs, d => d.streams);
        const totalStreams = d3.sum(monthSongs, d => d.streams);
        const topSong = monthSongs.reduce((max, s) => s.streams > max.streams ? s : max);

        const monthName = monthNames[month - 1];
        const monthColor = window.pieColors[month - 1];
        const colorObj = d3.hsl(monthColor);
        colorObj.l = Math.min(0.85, colorObj.l + 0.3);
        const lightColor = colorObj.toString();

        return `
            <div class="month-summary-card">
                <h3 style="color: ${lightColor}">${monthName}</h3>
                <div style="color: ${lightColor}"><strong>${monthSongs.length}</strong> songs released</div>
                <div style="color: ${lightColor}"><strong>${(totalStreams / 1e6).toFixed(1)}M</strong> total streams</div>
                <div style="color: ${lightColor}">Avg streams: <strong>${(avgStreams / 1e6).toFixed(1)}M</strong></div>
                <div style="color: ${lightColor}"><strong>Top song:</strong> ${topSong.track} – ${topSong.artist}</div>
            </div>
        `;
    };

    container.html(createMonthCard(monthA) + createMonthCard(monthB));
}

//radar chart

function initRadarChart() {
    // Slightly larger canvas so labels don't get clipped on the edges
    const width = 500;
    const height = 540;

    // Use a radius that leaves some padding inside the viewBox
    const radius = 190;

    radarSvg = d3.select("#radar-chart")
        .append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .style("width", "100%")
        .style("max-width", "450px");

    // Move the radar group to the visual center (a tiny bit down from exact center)
    radarGroup = radarSvg.append("g")
        .attr("transform", `translate(${width / 2}, ${height / 2 + 5})`);

    const levels = [25, 50, 75, 100];
    levels.forEach(level => {
        radarGroup.append("circle")
            .attr("class", "radar-grid")
            .attr("r", radius * (level / 100));
    });

    const features = ["Dance", "Energy", "Valence", "Acoustic", "Instr.", "Liveness", "Speech"];
    const angle = (Math.PI * 2) / features.length;

    features.forEach((feat, i) => {
        // Place labels slightly outside the outer circle
        const labelRadius = radius + 18;
        const x = Math.cos(i * angle - Math.PI / 2) * labelRadius;
        const y = Math.sin(i * angle - Math.PI / 2) * labelRadius;

        radarGroup.append("text")
            .attr("class", "radar-axis-label")
            .attr("x", x)
            .attr("y", y)
            .attr("text-anchor", "middle")
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

    const monthColor = window.pieColors[selectedMonth - 1];
    const colorObj = d3.color(monthColor);
    const rgbaFill = `rgba(${colorObj.r}, ${colorObj.g}, ${colorObj.b}, 0.4)`;

    radarGroup.append("path")
        .attr("class", "month-shape")
        .attr("d", radarPath(stats))
        .attr("fill", rgbaFill)
        .attr("stroke", monthColor);

    if (showAverage) {
        drawAverageShape();
    }
}

function drawAverageShape() {
    radarGroup.selectAll(".average-shape").remove();

    const averageStats = computeStats(allSongs);

    radarGroup.append("path")
        .attr("class", "average-shape")
        .attr("d", radarPath(averageStats))
        .attr("fill", "rgba(245, 245, 240, 0.3)")
        .attr("stroke", "#f5f5f0")
        .attr("stroke-width", 2);
}

function toggleAverageDisplay() {
    if (showAverage) {
        drawAverageShape();
    } else {
        radarGroup.selectAll(".average-shape").remove();
    }
}

// Line Graph

function computeMonthlyFeatureData() {
    // Pre-compute monthly averages for each audio feature (1 row per month).
    monthlyFeatureData = d3.range(1, 13).map(month => {
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
}

// build the checkboxes that control which features are drawn in the line graph.
function buildFeatureCheckboxes() {
    const container = d3.select("#feature-checkboxes");

    const options = container.selectAll(".feature-option")
        .data(FEATURES)
        .enter()
        .append("label")
        .attr("class", "feature-option");

    options.append("input")
        .attr("type", "checkbox")
        .attr("checked", true)
        .on("change", function (event, d) {
            if (this.checked) {
                // add this feature back in
                if (!activeFeatureKeys.includes(d.key)) {
                    activeFeatureKeys.push(d.key);
                }
            } else {
                // remove this feature from the active list
                activeFeatureKeys = activeFeatureKeys.filter(k => k !== d.key);
            }
            // redraw the line graph with the new set of active features
            renderLineGraph();
        });

    options.append("span")
        .text(d => d.label)
        .style("border-bottom-color", d => d.color);
}

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

    // Clear any previous SVG so we can fully redraw the graph.
    d3.select('#linegraph').selectAll('*').remove();

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

    // Draw one line + dots for each feature that is currently active.
    FEATURES.forEach(feature => {
        if (!activeFeatureKeys.includes(feature.key)) return;

        const lineData = monthlyFeatureData.map(d => ({
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

/* ==================== ARTIST IMPACT HELPERS ==================== */

// Compute top artists by total streams and render a bar chart showing streaming dominance.
function renderArtistImpactChart() {
    const container = d3.select("#artist-impact-chart");
    container.selectAll("*").remove();

    // Split artist names and attribute streams to each individual artist
    const individualArtistStreams = new Map();

    allSongs.forEach(song => {
        // Split by common delimiters: comma, ampersand, "feat.", "ft.", "featuring"
        const artists = song.artist
            .split(/,|&|\sfeat\.?\s|\sft\.?\s|\sfeaturing\s/i)
            .map(a => a.trim())
            .filter(a => a.length > 0);

        // Attribute full streams to each artist in the collaboration
        artists.forEach(artist => {
            if (!individualArtistStreams.has(artist)) {
                individualArtistStreams.set(artist, {
                    totalStreams: 0,
                    songCount: 0
                });
            }
            const data = individualArtistStreams.get(artist);
            data.totalStreams += song.streams;
            data.songCount += 1;
        });
    });

    // Convert to array and sort by total streams descending
    let artistData = Array.from(individualArtistStreams, ([artist, data]) => ({
        artist,
        totalStreams: data.totalStreams,
        songCount: data.songCount
    })).sort((a, b) => d3.descending(a.totalStreams, b.totalStreams));

    // Take top 30 artists
    const topN = 30;
    artistData = artistData.slice(0, topN);

    // Calculate total streams across ALL songs for percentage calculation
    const grandTotalStreams = d3.sum(allSongs, s => s.streams);

    // Add percentage share to each artist
    artistData.forEach(d => {
        d.sharePercent = (d.totalStreams / grandTotalStreams) * 100;
    });

    const width = 1000;
    const height = 1000;
    const margin = { top: 40, right: 150, bottom: 60, left: 200 };

    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .style("width", "100%")
        .style("max-width", "1000px");

    // Create scales
    const xScale = d3.scaleLinear()
        .domain([0, d3.max(artistData, d => d.totalStreams)])
        .range([margin.left, width - margin.right]);

    const yScale = d3.scaleBand()
        .domain(artistData.map(d => d.artist))
        .range([margin.top, height - margin.bottom])
        .padding(0.2);

    // Color scale for visual appeal
    const colorScale = d3.scaleSequential()
        .domain([topN - 1, 0])
        .interpolator(d3.interpolateViridis);

    // Draw bars
    svg.selectAll(".impact-bar")
        .data(artistData)
        .enter()
        .append("rect")
        .attr("class", "impact-bar")
        .attr("data-artist", d => d.artist)
        .attr("x", margin.left)
        .attr("y", d => yScale(d.artist))
        .attr("width", d => xScale(d.totalStreams) - margin.left)
        .attr("height", yScale.bandwidth())
        .attr("fill", (d, i) => colorScale(i))
        .attr("opacity", 0.85)
        .style("cursor", "pointer")
        .on("click", (event, d) => {
            renderArtistDeltaChart(d.artist);
            // Scroll to the artist delta chart
            document.getElementById("artist-delta-chart").scrollIntoView({ behavior: "smooth", block: "nearest" });
        })
        .on("mouseover", function (_, d) {
            // Highlight both bar and name
            d3.select(this).attr("opacity", 1);
            svg.selectAll(".artist-name-label")
                .filter(labelData => labelData.artist === d.artist)
                .style("text-decoration", "underline");
        })
        .on("mouseout", function (_, d) {
            // Remove highlight from both bar and name
            d3.select(this).attr("opacity", 0.85);
            svg.selectAll(".artist-name-label")
                .filter(labelData => labelData.artist === d.artist)
                .style("text-decoration", "none");
        });

    // Add ranking numbers
    svg.selectAll(".rank-label")
        .data(artistData)
        .enter()
        .append("text")
        .attr("class", "rank-label")
        .attr("x", margin.left - 140)
        .attr("y", d => yScale(d.artist) + yScale.bandwidth() / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .style("fill", "#f5f5f7")
        .style("font-size", "16px")
        .style("font-weight", "700")
        .text((d, i) => `#${i + 1}`);

    // Artist name labels
    svg.selectAll(".artist-name-label")
        .data(artistData)
        .enter()
        .append("text")
        .attr("class", "artist-name-label")
        .attr("data-artist", d => d.artist)
        .attr("x", margin.left - 10)
        .attr("y", d => yScale(d.artist) + yScale.bandwidth() / 2)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .style("fill", "#f5f5f7")
        .style("font-size", "12px")
        .style("cursor", "pointer")
        .text(d => d.artist.length > 25 ? d.artist.substring(0, 25) + "..." : d.artist)
        .on("click", (event, d) => {
            renderArtistDeltaChart(d.artist);
            // Scroll to the artist delta chart
            document.getElementById("artist-delta-chart").scrollIntoView({ behavior: "smooth", block: "nearest" });
        })
        .on("mouseover", function (_, d) {
            // Highlight both name and bar
            d3.select(this).style("text-decoration", "underline");
            svg.selectAll(".impact-bar")
                .filter(barData => barData.artist === d.artist)
                .attr("opacity", 1);
        })
        .on("mouseout", function (_, d) {
            // Remove highlight from both name and bar
            d3.select(this).style("text-decoration", "none");
            svg.selectAll(".impact-bar")
                .filter(barData => barData.artist === d.artist)
                .attr("opacity", 0.85);
        });

    // Stream count labels (inside bars)
    svg.selectAll(".stream-label")
        .data(artistData)
        .enter()
        .append("text")
        .attr("class", "stream-label")
        .attr("x", d => xScale(d.totalStreams) + 5)
        .attr("y", d => yScale(d.artist) + yScale.bandwidth() / 2)
        .attr("dominant-baseline", "middle")
        .style("fill", "#f5f5f7")
        .style("font-size", "11px")
        .style("font-weight", "600")
        .text(d => {
            const billions = d.totalStreams / 1e9;
            const millions = d.totalStreams / 1e6;
            if (billions >= 1) {
                return `${billions.toFixed(2)}B (${d.sharePercent.toFixed(1)}%)`;
            } else {
                return `${millions.toFixed(0)}M (${d.sharePercent.toFixed(1)}%)`;
            }
        });

    // X-axis
    const xAxis = d3.axisBottom(xScale)
        .ticks(5)
        .tickFormat(d => {
            if (d >= 1e9) return `${(d / 1e9).toFixed(1)}B`;
            if (d >= 1e6) return `${(d / 1e6).toFixed(0)}M`;
            return d;
        });

    svg.append("g")
        .attr("class", "x-axis")
        .attr("transform", `translate(0, ${height - margin.bottom})`)
        .call(xAxis)
        .selectAll("text")
        .style("fill", "#f5f5f7")
        .style("font-size", "12px");

    // X-axis label
    svg.append("text")
        .attr("x", (margin.left + width - margin.right) / 2)
        .attr("y", height - 15)
        .attr("text-anchor", "middle")
        .style("fill", "#f5f5f7")
        .style("font-size", "14px")
        .text("Total Streams");

    // Title
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", 20)
        .attr("text-anchor", "middle")
        .style("fill", "#f5f5f7")
        .style("font-size", "16px")
        .style("font-weight", "600")
        .text(`Top ${topN} Most Streamed Artists in 2023`);
}

/* ==================== ARTIST INSIGHTS HELPERS ==================== */

// Build the artist dropdown from the dataset (use top artists by song count).
function buildArtistDropdown() {
    const artistCounts = d3.rollup(
        allSongs,
        v => v.length,
        d => d.artist
    );

    // Turn the map into an array and sort by count descending.
    let artists = Array.from(artistCounts, ([artist, count]) => ({ artist, count }))
        .sort((a, b) => d3.descending(a.count, b.count));

    // Keep only the top 30 artists so the dropdown isn't huge.
    artists = artists.slice(0, 30);

    const select = d3.select("#artist-select");

    select.selectAll("option.artist-option").remove();

    select.selectAll("option.artist-option")
        .data(artists)
        .enter()
        .append("option")
        .attr("class", "artist-option")
        .attr("value", d => d.artist)
        .text(d => `${d.artist} (${d.count} songs)`);

    // When the user picks an artist, draw the delta bar chart.
    select.on("change", function () {
        const artistName = this.value;
        renderArtistDeltaChart(artistName);
    });
}

// Draw a horizontal bar chart showing (artist avg - global avg) for each feature.
function renderArtistDeltaChart(artistName) {
    const container = d3.select("#artist-delta-chart");
    container.selectAll("*").remove();

    if (!artistName) {
        // Add title
        container.append("h3")
            .style("color", "#f5f5f7")
            .style("margin-top", "40px")
            .style("margin-bottom", "10px")
            .text("Artist Insights");

        // If no artist selected, show a small message.
        container.append("p")
            .style("color", "#d0d0d5")
            .text("Click on an artist above to see how their sound differs from the 2023 average.");
        return;
    }

    // Filter songs where the artist appears (including collaborations)
    const artistSongs = allSongs.filter(d => {
        const artists = d.artist
            .split(/,|&|\sfeat\.?\s|\sft\.?\s|\sfeaturing\s/i)
            .map(a => a.trim());
        return artists.includes(artistName);
    });

    if (artistSongs.length === 0) {
        container.append("p")
            .style("color", "#d0d0d5")
            .text("No songs found for this artist in the dataset.");
        return;
    }

    // Add title section
    container.append("h3")
        .style("color", "#f5f5f7")
        .style("margin-top", "40px")
        .style("margin-bottom", "10px")
        .text("Artist Insights");

    // Add artist name
    container.append("h4")
        .style("color", "#f5f5f7")
        .style("margin-top", "10px")
        .style("margin-bottom", "20px")
        .style("font-size", "20px")
        .text(artistName);

    // Compute average audio features for the chosen artist.
    const artistStats = computeStats(artistSongs);

    // Compute feature deltas: artist average - global 2023 average.
    const deltas = FEATURES.map(f => {
        const artistValue = artistStats[f.key];
        const globalValue = globalFeatureStats[f.key];
        return {
            featureKey: f.key,
            label: f.label,
            delta: artistValue - globalValue
        };
    });

    const width = 900;
    const height = 40 * FEATURES.length + 100;
    const margin = { top: 20, right: 80, bottom: 50, left: 180 };

    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .style("width", "100%")
        .style("max-width", "900px");

    const xMax = d3.max(deltas, d => Math.abs(d.delta)) || 1;
    const xScale = d3.scaleLinear()
        .domain([-xMax, xMax])
        .range([margin.left, width - margin.right]);

    const yScale = d3.scaleBand()
        .domain(deltas.map(d => d.label))
        .range([margin.top, height - margin.bottom])
        .padding(0.25);

    // Zero line helps the viewer see positive vs negative differences.
    svg.append("line")
        .attr("x1", xScale(0))
        .attr("x2", xScale(0))
        .attr("y1", margin.top - 10)
        .attr("y2", height - margin.bottom)
        .attr("stroke", "#666")
        .attr("stroke-width", 0.8)
        .attr("stroke-dasharray", "3,3");

    // One horizontal bar per feature.
    svg.selectAll(".artist-delta-bar")
        .data(deltas)
        .enter()
        .append("rect")
        .attr("class", "artist-delta-bar")
        .attr("y", d => yScale(d.label))
        .attr("height", yScale.bandwidth())
        .attr("x", d => d.delta >= 0 ? xScale(0) : xScale(d.delta))
        .attr("width", d => Math.abs(xScale(d.delta) - xScale(0)))
        .attr("fill", d => d.delta >= 0 ? "#2ca02c" : "#d62728");

    // Feature labels on the left.
    svg.append("g")
        .attr("class", "artist-delta-y-axis")
        .attr("transform", `translate(${margin.left - 10},0)`)
        .call(d3.axisLeft(yScale))
        .selectAll("text")
        .style("fill", "#f5f5f7")
        .style("font-size", "12px");

    // X-axis with small ticks (delta values).
    svg.append("g")
        .attr("class", "artist-delta-x-axis")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(xScale).ticks(5))
        .selectAll("text")
        .style("fill", "#f5f5f7")
        .style("font-size", "11px");

    // Explanation text
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height - 5)
        .attr("text-anchor", "middle")
        .style("fill", "#f5f5f7")
        .style("font-size", "12px")
        .text("Value > 0 means higher than 2023 average; value < 0 means lower.");

    // Add song releases section below the delta chart
    // Sort songs by release date (month and day)
    const sortedSongs = artistSongs.slice().sort((a, b) => {
        const aMonth = a.released_month || 0;
        const bMonth = b.released_month || 0;
        if (aMonth !== bMonth) return aMonth - bMonth;

        const aDay = a.released_day || 0;
        const bDay = b.released_day || 0;
        return aDay - bDay;
    });

    // Create song list container
    const songList = container.append("div")
        .style("color", "#d0d0d5")
        .style("margin-top", "40px")
        .style("margin-bottom", "20px")
        .style("padding", "15px")
        .style("background-color", "rgba(255, 255, 255, 0.05)")
        .style("border-radius", "5px")
        .style("max-height", "400px")
        .style("overflow-y", "auto");

    // Add title for song releases inside the container
    songList.append("h4")
        .style("color", "#f5f5f7")
        .style("margin-top", "0")
        .style("margin-bottom", "15px")
        .style("font-size", "18px")
        .text(`${artistSongs.length} song releases in 2023`);

    // Add each song as a list item
    const ul = songList.append("ul")
        .style("margin", "0")
        .style("padding-left", "20px");

    sortedSongs.forEach(song => {
        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const month = song.released_month ? monthNames[song.released_month - 1] : "?";
        const day = song.released_day || "?";

        // Create search queries for each platform
        const searchQuery = encodeURIComponent(`${song.track} ${artistName}`);
        const youtubeUrl = `https://www.youtube.com/results?search_query=${searchQuery}`;
        const spotifyUrl = `https://open.spotify.com/search/${searchQuery}`;
        const appleMusicUrl = `https://music.apple.com/search?term=${searchQuery}`;

        const li = ul.append("li")
            .style("margin-bottom", "10px")
            .style("color", "#d0d0d5")
            .style("display", "flex")
            .style("align-items", "center")
            .style("gap", "10px");

        // Song title, date, and streams
        const streams = song.streams >= 1e9
            ? `${(song.streams / 1e9).toFixed(2)}B`
            : `${(song.streams / 1e6).toFixed(0)}M`;

        li.append("span")
            .html(`<strong style="color: #f5f5f7">${song.track}</strong> - Released: ${month} ${day}, 2023 - <span style="color: #1DB954; font-weight: 600">${streams} streams</span>`);

        // Container for links
        const linksContainer = li.append("span")
            .style("display", "flex")
            .style("gap", "8px")
            .style("margin-left", "auto");

        // YouTube link
        linksContainer.append("a")
            .attr("href", youtubeUrl)
            .attr("target", "_blank")
            .attr("rel", "noopener noreferrer")
            .attr("title", "Listen on YouTube")
            .style("display", "inline-block")
            .style("width", "20px")
            .style("height", "20px")
            .html(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FF0000" width="20" height="20">
                <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>`);

        // Spotify link
        linksContainer.append("a")
            .attr("href", spotifyUrl)
            .attr("target", "_blank")
            .attr("rel", "noopener noreferrer")
            .attr("title", "Listen on Spotify")
            .style("display", "inline-block")
            .style("width", "20px")
            .style("height", "20px")
            .html(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#1DB954" width="20" height="20">
                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
            </svg>`);

        // Apple Music link
        linksContainer.append("a")
            .attr("href", appleMusicUrl)
            .attr("target", "_blank")
            .attr("rel", "noopener noreferrer")
            .attr("title", "Listen on Apple Music")
            .style("display", "inline-block")
            .style("width", "20px")
            .style("height", "20px")
            .html(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#FA57C1" width="20" height="20">
                <path d="M23.997 6.124c0-.738-.065-1.47-.24-2.19-.317-1.31-1.062-2.31-2.18-3.043C21.003.517 20.373.285 19.7.164c-.517-.093-1.038-.135-1.564-.15-.04-.003-.083-.01-.124-.013H5.988c-.152.01-.303.017-.455.026C4.786.07 4.043.15 3.34.428 2.004.958 1.04 1.88.475 3.208c-.192.448-.292.925-.363 1.408-.056.392-.088.785-.1 1.18 0 .032-.007.062-.01.093v12.223c.01.14.017.283.027.424.05.815.154 1.624.497 2.373.65 1.42 1.738 2.353 3.234 2.801.42.127.856.187 1.293.228.555.053 1.11.06 1.667.06h11.03c.525 0 1.048-.034 1.57-.1.823-.106 1.597-.35 2.296-.81a5.044 5.044 0 0 0 1.88-2.207c.186-.42.293-.87.37-1.324.113-.675.138-1.358.137-2.04-.002-3.8 0-7.595-.003-11.393zm-6.423 3.99v5.712c0 .417-.058.827-.244 1.206-.29.59-.76 1.023-1.364 1.268-.83.337-1.657.323-2.468-.05-.57-.262-1.017-.667-1.302-1.254-.254-.524-.286-1.08-.168-1.65.18-.852.695-1.462 1.448-1.863.523-.278 1.09-.42 1.67-.524.414-.075.826-.143 1.24-.21.155-.025.285-.11.392-.235.186-.215.25-.46.232-.72-.014-.198-.008-.397-.008-.595v-4.49c0-.016-.002-.032-.005-.048-.022-.15-.124-.25-.28-.258-.062-.003-.123.005-.185.013l-4.328.777c-.12.022-.235.05-.354.076-.088.02-.15.075-.196.157-.022.04-.033.09-.033.136v7.368c0 .4-.065.79-.243 1.16-.29.605-.763 1.04-1.372 1.295-.828.346-1.656.34-2.47-.038-.57-.267-1.01-.68-1.293-1.267-.248-.516-.286-1.064-.173-1.626.18-.857.696-1.47 1.457-1.87.525-.276 1.087-.415 1.67-.516.41-.07.817-.14 1.225-.207.11-.02.204-.06.29-.13.254-.208.332-.5.288-.794-.017-.117-.012-.235-.012-.353V5.443c0-.057.003-.113.01-.17.013-.103.068-.18.167-.225.054-.024.118-.036.178-.048l5.19-.933c.403-.073.807-.145 1.21-.22.047-.008.096-.013.144-.02.27-.027.444.115.47.382.01.097.013.194.013.29v5.66z"/>
            </svg>`);
    });
}


// =================== INITIALIZE EVERYTHING ===================

allSongs = await loadData();
renderGraph(countSongs(allSongs));
initRadarChart();

// Precompute data for other views.
computeMonthlyFeatureData();
buildFeatureCheckboxes();
renderLineGraph();

// Compute global average feature stats once for the artist section.
globalFeatureStats = computeStats(allSongs);

// Render the Artist Impact chart showing streaming dominance.
renderArtistImpactChart();

// Show default message in the artist chart area.
renderArtistDeltaChart("");

// Toggle between compare-mode and single-mode
document.getElementById("compare-toggle").addEventListener("change", (e) => {
    compareMode = e.target.checked;

    if (compareMode) {
        // If a month is already selected, add it to the comparison
        if (currentSelectedMonth !== null) {
            selectedMonths = [currentSelectedMonth];
            const monthName = monthNames[currentSelectedMonth - 1];
            d3.select("#compare-status").text(`Selected: ${monthName} — choose another month`);
            // Show the first month blob on radar chart and keep the summary
            radarGroup.selectAll(".compare-shape").remove();
            radarGroup.selectAll(".month-shape").remove();
            updateSingleComparisonChart(currentSelectedMonth);
            updateMonthOverview(currentSelectedMonth);
        } else {
            selectedMonths = [];
            d3.select("#compare-status").text("Select two months...");
            d3.select("#month-summary")
                .html('<p style="color: #f5f5f7; margin: 0;">Click a slice to explore that month.</p>')
                .attr("class", "");
        }
    } else {
        // When exiting compare mode, restore single selection if there was one
        if (selectedMonths.length > 0) {
            currentSelectedMonth = selectedMonths[0];
            updatePieSliceSelection(currentSelectedMonth);
            updateMonthOverview(currentSelectedMonth);
            updateRadarChart(currentSelectedMonth);
        }
        selectedMonths = [];
        d3.select("#compare-status").text("");
    }
});

document.getElementById("average-toggle").addEventListener("change", (e) => {
    showAverage = e.target.checked;
    toggleAverageDisplay();
});

document.getElementById("clear-selections-btn").addEventListener("click", () => {
    clearSelections();

    // Uncheck compare months toggle
    const compareToggle = document.getElementById("compare-toggle");
    if (compareToggle.checked) {
        compareToggle.checked = false;
        compareMode = false;
    }

    // Uncheck show average toggle
    const averageToggle = document.getElementById("average-toggle");
    if (averageToggle.checked) {
        averageToggle.checked = false;
        showAverage = false;
        radarGroup.selectAll(".average-shape").remove();
    }
});