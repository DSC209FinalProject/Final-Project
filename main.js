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
                ? selectedMonths.includes(d.data.month  )
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
    pieSlices.each(function(d) {
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
        // If no artist selected, show a small message.
        container.append("p")
            .style("color", "#d0d0d5")
            .text("Select an artist above to see how their sound differs from the 2023 average.");
        return;
    }

    const artistSongs = allSongs.filter(d => d.artist === artistName);

    if (artistSongs.length === 0) {
        container.append("p")
            .style("color", "#d0d0d5")
            .text("No songs found for this artist in the dataset.");
        return;
    }

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
    const height = 40 * FEATURES.length + 80;
    const margin = { top: 20, right: 80, bottom: 30, left: 180 };

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

    // Small text label below the chart.
    svg.append("text")
        .attr("x", width / 2)
        .attr("y", height - 5)
        .attr("text-anchor", "middle")
        .style("fill", "#f5f5f7")
        .style("font-size", "12px")
        .text(`${artistName}: value > 0 means higher than 2023 average; value < 0 means lower.`);
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

// Build artist dropdown and show default message in the artist chart area.
buildArtistDropdown();
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