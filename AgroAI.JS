// script.js

let map;
let fieldLocationMarker; // Renamed 'marker' to 'fieldLocationMarker' for clarity
let manualWaterSourceMarker; // New marker for manually selected water source
let predictedWaterSourceMapMarker; // New marker for predicted water source
let referralId = '';
let satelliteLayer; // To hold the satellite tile layer
let openStreetMapLayer; // To hold the OpenStreetMap tile layer
let predictedUnderwaterLayer; // To hold the predicted underwater locations
let isSatelliteView = false; // Flag to track current map view
let predictedWaterSourceCoords = { lat: null, lng: null }; // Store predicted water source coordinates
let manualWaterSourceCoords = { lat: null, lng: null }; // Store manually selected water source coordinates
let isManualWaterSourceSelectionMode = false; // New flag for manual selection mode
let currentAnalysisData = {}; // Global variable to store the analysis data for PDF generation

// Function to initialize the map
function initMap() {
    // Changed defaultCoords to [0, 0] and zoom to 2 for a global view
    const defaultCoords = [0, 0];
    map = L.map('map').setView(defaultCoords, 2); // Zoom level 2 for world view

    // Initialize OpenStreetMap layer
    openStreetMapLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    // Initialize Esri World Imagery (Satellite) layer, not added to map initially
    satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, swisstopo, and the GIS User Community'
    });

    // Initialize predicted underwater locations layer group
    predictedUnderwaterLayer = L.layerGroup().addTo(map); // Add to map initially, but it will be empty

    // Add event listener for map movement
    map.on('moveend', function() {
        if (isSatelliteView) {
            addPredictedUnderwaterLocations();
        }
    });

    // Add click listener for manual water source selection
    map.on('click', function(e) {
        if (isManualWaterSourceSelectionMode) {
            selectManualWaterSource(e.latlng.lat, e.latlng.lng);
        }
    });
}

// Function to update the map with new coordinates and trigger soil analysis
function updateMap(lat, lng) {
    if (isNaN(lat) || isNaN(lng)) {
        console.error("Invalid coordinates for map update:", lat, lng);
        return;
    }

    const newLatLng = new L.LatLng(lat, lng);
    map.setView(newLatLng, 15); // Zoom in to a closer level

    if (fieldLocationMarker) {
        fieldLocationMarker.setLatLng(newLatLng);
    } else {
        fieldLocationMarker = L.marker(newLatLng).addTo(map);
    }
    fieldLocationMarker.bindPopup(`Field Location: ${lat.toFixed(4)}, ${lng.toFixed(4)}`).openPopup();

    // Trigger soil type determination for the new location
    determineSoilType(lat, lng);
    // Trigger water source suitability determination for the new location
    determinePredictedWaterSourceSuitability(lat, lng);
}

// Function to get GPS location
function getGpsLocation() {
    const statusDiv = document.getElementById('locationStatus');
    statusDiv.textContent = 'Getting your location...';
    statusDiv.className = 'text-sm text-blue-200 mt-2 text-center';

    // Hide manual coordinate inputs if visible
    document.getElementById('manualCoordsInput').classList.add('hidden');

    // Disable manual water source selection mode
    isManualWaterSourceSelectionMode = false;
    map.getContainer().style.cursor = ''; // Reset cursor
    document.getElementById('mapSelectionModalOverlay').style.display = 'none'; // Hide map selection modal

    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                document.getElementById('latitude').value = lat.toFixed(6);
                document.getElementById('longitude').value = lng.toFixed(6);
                updateMap(lat, lng); // This will now also determine soil type and water suitability
                statusDiv.textContent = 'Location found successfully!';
                statusDiv.className = 'text-sm text-green-300 mt-2 text-center'; /* Brighter green for success */
                generateReferralId(); // Generate ID once location is set
            },
            (error) => {
                let errorMessage = 'Error getting location.';
                switch(error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = "Location access denied. Please enable location services in your browser settings.";
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = "Location information is unavailable.";
                        break;
                    case error.TIMEOUT:
                        errorMessage = "The request to get user location timed out.";
                        break;
                    case error.UNKNOWN_ERROR:
                        errorMessage = "An unknown error occurred.";
                        break;
                }
                statusDiv.textContent = errorMessage;
                statusDiv.className = 'text-sm text-red-300 mt-2 text-center'; /* Brighter red for error */
                console.error("Geolocation Error:", error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    } else {
        statusDiv.textContent = 'Geolocation is not supported by your browser.';
        statusDiv.className = 'text-sm text-red-300 mt-2 text-center'; /* Brighter red for error */
    }
}

// Function to show/hide manual coordinate input fields
function showManualCoords() {
    const manualCoordsInput = document.getElementById('manualCoordsInput');
    if (manualCoordsInput.classList.contains('hidden')) {
        manualCoordsInput.classList.remove('hidden');
        document.getElementById('locationStatus').textContent = ''; // Clear status
    } else {
        manualCoordsInput.classList.add('hidden');
    }
    // Disable manual water source selection mode
    isManualWaterSourceSelectionMode = false;
    map.getContainer().style.cursor = ''; // Reset cursor
    document.getElementById('mapSelectionModalOverlay').style.display = 'none'; // Hide map selection modal
}

// Function to apply manual coordinates
function submitManualCoords() {
    const lat = parseFloat(document.getElementById('latitude').value);
    const lng = parseFloat(document.getElementById('longitude').value);
    const statusDiv = document.getElementById('locationStatus');

    if (!isNaN(lat) && !isNaN(lng)) {
        updateMap(lat, lng); // This will now also determine soil type and water suitability
        statusDiv.textContent = 'Manual coordinates applied!';
        statusDiv.className = 'text-sm text-green-300 mt-2 text-center'; /* Brighter green for success */
        generateReferralId(); // Generate ID once location is set
    } else {
        statusDiv.textContent = 'Please enter valid latitude and longitude.';
        statusDiv.className = 'text-sm text-red-300 mt-2 text-center'; /* Brighter red for error */
    }
    // Disable manual water source selection mode
    isManualWaterSourceSelectionMode = false;
    map.getContainer().style.cursor = ''; // Reset cursor
    document.getElementById('mapSelectionModalOverlay').style.display = 'none'; // Hide map selection modal
}

// Function to search manual location using Nominatim (OpenStreetMap's geocoding service)
async function searchManualLocation() {
    const locationName = document.getElementById('manualLocation').value;
    const statusDiv = document.getElementById('locationStatus');
    statusDiv.textContent = 'Searching for location...';
    statusDiv.className = 'text-sm text-blue-200 mt-2 text-center';

    if (!locationName) {
        statusDiv.textContent = 'Please enter a location name.';
        statusDiv.className = 'text-sm text-red-300 mt-2 text-center'; /* Brighter red for error */
        return;
    }

    // Disable manual water source selection mode
    isManualWaterSourceSelectionMode = false;
    map.getContainer().style.cursor = ''; // Reset cursor
    document.getElementById('mapSelectionModalOverlay').style.display = 'none'; // Hide map selection modal

    // Nominatim API for geocoding
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationName)}&format=json&limit=1`;

    try {
        const response = await fetch(nominatimUrl);
        const data = await response.json();

        if (data && data.length > 0) {
            const lat = parseFloat(data[0].lat);
            const lng = parseFloat(data[0].lon);
            document.getElementById('latitude').value = lat.toFixed(6);
            document.getElementById('longitude').value = lng.toFixed(6);
            updateMap(lat, lng); // This will now also determine soil type and water suitability
            statusDiv.textContent = `Location found: ${data[0].display_name}`;
            statusDiv.className = 'text-sm text-green-300 mt-2 text-center'; /* Brighter green for success */
            generateReferralId();
        } else {
            statusDiv.textContent = 'Location not found. Please try a different name.';
            statusDiv.className = 'text-sm text-red-300 mt-2 text-center'; /* Brighter red for error */
        }
    } catch (error) {
        console.error("Error searching location:", error);
        statusDiv.textContent = 'Error searching location. Please try again.';
        statusDiv.className = 'text-sm text-red-300 mt-2 text-center'; /* Brighter red for error */
    }
}

// Function to generate a unique referral ID
function generateReferralId() {
    referralId = 'AGRO-' + crypto.randomUUID().substring(0, 8).toUpperCase();
    document.getElementById('referralIdDisplay').textContent = referralId;
    document.getElementById('copyStatus').textContent = ''; // Clear copy status
}

// Function to copy referral ID to clipboard
function copyReferralId() {
    const idToCopy = document.getElementById('referralIdDisplay').textContent;
    const copyStatusDiv = document.getElementById('copyStatus');

    // Use document.execCommand('copy') for better compatibility in iframes
    const tempInput = document.createElement('textarea');
    tempInput.value = idToCopy;
    document.body.appendChild(tempInput);
    tempInput.select();
    try {
        document.execCommand('copy');
        copyStatusDiv.textContent = 'Referral ID copied to clipboard!';
        copyStatusDiv.className = 'text-sm text-green-300 mt-2 text-center'; /* Brighter green for success */
    } finally {
        document.body.removeChild(tempInput);
    }
}

// Function to add simulated predicted underwater locations
function addPredictedUnderwaterLocations() {
    // Clear existing predicted locations
    predictedUnderwaterLayer.clearLayers();

    // Get current map bounds to generate points within the visible area
    const bounds = map.getBounds();
    const southWest = bounds.getSouthWest();
    const northEast = bounds.getNorthEast();

    // Define a few "hotspot" centers for more clustered data
    const hotspots = [
        // Example hotspots (you can adjust these or add more)
        [southWest.lat + (northEast.lat - southWest.lat) * 0.2, southWest.lng + (northEast.lng - southWest.lng) * 0.3],
        [southWest.lat + (northEast.lat - southWest.lat) * 0.7, southWest.lng + (northEast.lng - southWest.lng) * 0.6],
        [southWest.lat + (northEast.lat - southWest.lat) * 0.4, southWest.lng + (northEast.lng - southWest.lng) * 0.8]
    ];

    const pointsPerHotspot = 10; // Number of points around each hotspot
    const randomPoints = 20; // Additional random points for broader coverage
    const spread = 0.05; // Controls how spread out points are around a hotspot

    // Get the info window elements
    const infoWindow = document.getElementById('predictionInfoWindow');
    const infoType = document.getElementById('infoType');
    const infoVolume = document.getElementById('infoVolume');
    const infoQuality = document.getElementById('infoQuality');
    const infoConfidence = document.getElementById('infoConfidence');
    const infoDepth = document.getElementById('infoDepth');
    const infoFlowRate = document.getElementById('infoFlowRate');
    const infoTimeExtract = document.getElementById('infoTimeExtract');


    // Function to display the info window with detailed data
    function showInfoWindow(data) {
        infoType.textContent = data.type;
        infoVolume.textContent = data.volume;
        infoQuality.textContent = data.quality;
        infoConfidence.textContent = data.confidence;
        infoDepth.textContent = data.depth;
        infoFlowRate.textContent = data.flowRate;
        infoTimeExtract.textContent = data.timeToExtract;
        infoWindow.style.display = 'flex'; // Use flex to enable column layout
    }

    // Helper function to generate random data for a prediction
    function generatePredictionData() {
        const types = ["Freshwater Aquifer", "Brackish Water Reservoir", "Mineral-Rich Source", "Deep Underground Lake"];
        const qualities = ["High", "Medium", "Low"];
        const volumes = [`${(Math.random() * 10000 + 1000).toFixed(0)} cubic meters`, `${(Math.random() * 50000 + 5000).toFixed(0)} liters`];
        const depths = [`${(Math.random() * 200 + 20).toFixed(0)} meters`, `${(Math.random() * 500 + 50).toFixed(0)} feet`];
        const flowRates = [`${(Math.random() * 500 + 50).toFixed(0)} liters/hour`, `${(Math.random() * 10 + 1).toFixed(1)} m³/day`];
        const timeToExtract = [`${(Math.random() * 60 + 10).toFixed(0)} days`, `${(Math.random() * 12 + 1).toFixed(0)} weeks`];

        return {
            type: types[Math.floor(Math.random() * types.length)],
            volume: volumes[Math.floor(Math.random() * volumes.length)],
            quality: qualities[Math.floor(Math.random() * qualities.length)],
            confidence: `${(Math.random() * 30 + 70).toFixed(0)}%`, // 70-99%
            depth: depths[Math.floor(Math.random() * depths.length)],
            flowRate: flowRates[Math.floor(Math.random() * flowRates.length)],
            timeToExtract: timeToExtract[Math.floor(Math.random() * timeToExtract.length)]
        };
    }

    // Generate points around hotspots
    hotspots.forEach(hotspot => {
        for (let i = 0; i < pointsPerHotspot; i++) {
            const lat = hotspot[0] + (Math.random() - 0.5) * spread;
            const lng = hotspot[1] + (Math.random() - 0.5) * spread;

            // Ensure points are within current map bounds
            if (lat >= southWest.lat && lat <= northEast.lat && lng >= southWest.lng && lng <= northEast.lng) {
                const predictionData = generatePredictionData();
                const circle = L.circleMarker([lat, lng], {
                    color: '#00FFFF', // Cyan color for water
                    fillColor: '#00FFFF',
                    fillOpacity: 0.5,
                    radius: 8
                });

                // Attach click event listener to show the info window
                circle.on('click', function(e) {
                    showInfoWindow(predictionData);
                });

                predictedUnderwaterLayer.addLayer(circle);
            }
        }
    });

    // Generate additional random points for broader distribution
    for (let i = 0; i < randomPoints; i++) {
        const lat = southWest.lat + (Math.random() * (northEast.lat - southWest.lat));
        const lng = southWest.lng + (Math.random() * (northEast.lng - southWest.lng));

        const predictionData = generatePredictionData();
        const circle = L.circleMarker([lat, lng], {
            color: '#00FFFF', // Cyan color for water
            fillColor: '#00FFFF',
            fillOpacity: 0.5,
            radius: 8
        });

        // Attach click event listener to show the info window
        circle.on('click', function(e) {
            showInfoWindow(predictionData);
        });

        predictedUnderwaterLayer.addLayer(circle);
    }
}

// Function to determine soil type (simulated)
function determineSoilType(lat, lng) {
    const soilTypeDisplay = document.getElementById('soilTypeDisplay');
    const soilTypes = ["Loamy", "Sandy", "Clayey", "Silty", "Peaty", "Chalky"];
    const randomSoilType = soilTypes[Math.floor(Math.random() * soilTypes.length)];
    soilTypeDisplay.textContent = randomSoilType;
}

// Function to determine closest water source and its suitability (simulated)
function determinePredictedWaterSourceSuitability(lat, lng) {
    const predictedWaterSourceTypeDisplay = document.getElementById('predictedWaterSourceType');
    const predictedWaterSuitabilityDisplay = document.getElementById('predictedWaterSuitability');

    const waterSourceTypes = ["River", "Lake", "Underground Aquifer", "Spring"];
    const suitabilityOptions = ["Highly Suitable", "Moderately Suitable", "Not Recommended"];

    const randomSourceType = waterSourceTypes[Math.floor(Math.random() * waterSourceTypes.length)];
    const randomSuitability = suitabilityOptions[Math.floor(Math.random() * suitabilityOptions.length)];

    predictedWaterSourceTypeDisplay.textContent = randomSourceType;
    predictedWaterSuitabilityDisplay.textContent = randomSuitability;

    // Simulate coordinates for the closest water source (can be near the current map center)
    predictedWaterSourceCoords.lat = lat + (Math.random() - 0.5) * 0.1; // Small offset
    predictedWaterSourceCoords.lng = lng + (Math.random() - 0.5) * 0.1; // Small offset
}

// Function to navigate to the predicted water source on the map
function goToWaterSourceLocation() {
    const modalOverlay = document.getElementById('confirmationModalOverlay');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalPredictedLat = document.getElementById('modalPredictedLat');
    const modalPredictedLng = document.getElementById('modalPredictedLng');

    // Hide these by default
    modalPredictedLat.style.display = 'none';
    modalPredictedLng.style.display = 'none';

    if (predictedWaterSourceCoords.lat !== null && predictedWaterSourceCoords.lng !== null) {
        map.setView([predictedWaterSourceCoords.lat, predictedWaterSourceCoords.lng], 15); // Zoom in

        // Define a custom icon for the predicted water source marker (e.g., green droplet)
        const predictedWaterIcon = L.divIcon({
            className: 'custom-div-icon',
            html: '<i class="fa-solid fa-droplet text-green-400 text-2xl"></i>', // Green water droplet icon
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        });

        if (predictedWaterSourceMapMarker) {
            predictedWaterSourceMapMarker.setLatLng([predictedWaterSourceCoords.lat, predictedWaterSourceCoords.lng]);
        } else {
            predictedWaterSourceMapMarker = L.marker([predictedWaterSourceCoords.lat, predictedWaterSourceCoords.lng], {
                icon: predictedWaterIcon
            }).addTo(map);
        }
        predictedWaterSourceMapMarker.bindPopup("Predicted Water Source").openPopup();

        // If successful, ensure modal is hidden
        modalOverlay.style.display = 'none';

    } else {
        modalTitle.textContent = "Predicted Water Source Information";
        modalMessage.textContent = "The predicted water source will be determined after you select your agricultural field location on the map (using GPS, manual coordinates, or search).";

        // Show and populate the latitude and longitude fields as N/A
        modalPredictedLat.style.display = 'block';
        modalPredictedLng.style.display = 'block';
        modalPredictedLat.querySelector('span').textContent = 'N/A';
        modalPredictedLng.querySelector('span').textContent = 'N/A';

        modalOverlay.style.display = 'flex';
    }
}

// Function to enable manual selection of water source
function enableManualWaterSourceSelection() {
    isManualWaterSourceSelectionMode = true;
    map.getContainer().style.cursor = 'crosshair'; // Change cursor to indicate selection mode
    
    // Show the specific map selection modal
    document.getElementById('mapSelectionModalOverlay').style.display = 'flex';
}

// Function to handle manual water source selection on map click
function selectManualWaterSource(lat, lng) {
    isManualWaterSourceSelectionMode = false; // Exit manual selection mode
    map.getContainer().style.cursor = ''; // Reset cursor

    manualWaterSourceCoords.lat = lat;
    manualWaterSourceCoords.lng = lng;

    // Update the display with the manually selected source type and suitability (simulated)
    const manualWaterSourceTypeDisplay = document.getElementById('manualWaterSourceType');
    const manualWaterSuitabilityDisplay = document.getElementById('manualWaterSuitability');
    const goToManualWaterSourceBtn = document.getElementById('goToManualWaterSourceBtn');

    const waterSourceTypes = ["Manually Selected Source (River)", "Manually Selected Source (Lake)", "Manually Selected Source (Well)"];
    const suitabilityOptions = ["Highly Suitable", "Moderately Suitable", "Not Recommended"];

    manualWaterSourceTypeDisplay.textContent = waterSourceTypes[Math.floor(Math.random() * waterSourceTypes.length)];
    manualWaterSuitabilityDisplay.textContent = suitabilityOptions[Math.floor(Math.random() * suitabilityOptions.length)];
    goToManualWaterSourceBtn.style.display = 'flex'; // Show the "View Manually Selected Source" button

    // Add or update the manual water source marker
    if (manualWaterSourceMarker) {
        manualWaterSourceMarker.setLatLng([lat, lng]);
    } else {
        manualWaterSourceMarker = L.marker([lat, lng], {
            icon: L.divIcon({
                className: 'custom-div-icon',
                html: '<i class="fa-solid fa-droplet text-green-400 text-2xl"></i>', // Green water droplet icon
                iconSize: [30, 30],
                iconAnchor: [15, 30]
            })
        }).addTo(map);
    }
    manualWaterSourceMarker.bindPopup("Manually Selected Water Source").openPopup();

    // Hide the map selection modal
    document.getElementById('mapSelectionModalOverlay').style.display = 'none';
}

// Function to navigate to the manually selected water source on the map
function goToManualWaterSourceLocation() {
    if (manualWaterSourceCoords.lat !== null && manualWaterSourceCoords.lng !== null) {
        map.setView([manualWaterSourceCoords.lat, manualWaterSourceCoords.lng], 15); // Zoom in
        if (manualWaterSourceMarker) { // Use manualWaterSourceMarker here
            manualWaterSourceMarker.setLatLng([manualWaterSourceCoords.lat, manualWaterSourceCoords.lng]);
        } else {
            manualWaterSourceMarker = L.marker([manualWaterSourceCoords.lat, manualWaterSourceCoords.lng]).addTo(map);
        }
        manualWaterSourceMarker.bindPopup("Manually Selected Water Source").openPopup();
    } else {
        const modalOverlay = document.getElementById('confirmationModalOverlay');
        const modalTitle = document.querySelector('#confirmationModal h3');
        const modalMessage = document.querySelector('#confirmationModal p.text-sm');
        // Ensure these are hidden if they were shown by another function
        document.getElementById('modalPredictedLat').style.display = 'none';
        document.getElementById('modalPredictedLng').style.display = 'none';

        modalTitle.textContent = "Location Error";
        modalMessage.textContent = "No manual water source selected yet.";
        modalOverlay.style.display = 'flex';
    }
}

// Function to toggle between OpenStreetMap and Satellite view, and show/hide predictions
function toggleSatelliteView() {
    if (isSatelliteView) {
        // Switch to OpenStreetMap view
        map.removeLayer(satelliteLayer);
        map.addLayer(openStreetMapLayer);
        predictedUnderwaterLayer.clearLayers(); // Hide predictions when not in satellite view
        document.getElementById('predictionInfoWindow').style.display = 'none'; // Hide info window
        isSatelliteView = false;
    } else {
        // Switch to Satellite view
        map.removeLayer(openStreetMapLayer);
        map.addLayer(satelliteLayer);
        addPredictedUnderwaterLocations(); // Add predictions when in satellite view
        isSatelliteView = true;
    }
    // Disable manual water source selection mode when toggling map view
    isManualWaterSourceSelectionMode = false;
    map.getContainer().style.cursor = ''; // Reset cursor
    document.getElementById('mapSelectionModalOverlay').style.display = 'none'; // Hide map selection modal
}

// Function to determine crop suitability (simulated - no API call)
async function determineCropSuitability(cropName, soilType, waterSourceSuitability, satelliteData) {
    if (!cropName) {
        return { suitability: "N/A", reasons: ["Please enter a desired crop."] };
    }

    let suitability = "Uncertain";
    let reasons = [];

    // Simple simulated logic for suitability
    if (soilType === "Loamy" && waterSourceSuitability === "Highly Suitable" && parseFloat(satelliteData.temperature) > 15 && parseFloat(satelliteData.temperature) < 30) {
        suitability = "Highly Suitable";
        reasons.push("Optimal soil type and water source, with favorable temperature range.");
    } else if (soilType === "Sandy" && waterSourceSuitability === "Moderately Suitable") {
        suitability = "Moderately Suitable";
        reasons.push("Sandy soil may require more water retention strategies, but water source is adequate.");
    } else {
        suitability = "Not Recommended";
        reasons.push("Conditions are not ideal for this crop based on current data.");
    }

    // Add some random variation for demonstration
    if (Math.random() < 0.2) { // 20% chance to slightly alter outcome
        if (suitability === "Highly Suitable") suitability = "Moderately Suitable";
        else if (suitability === "Moderately Suitable") suitability = "Highly Suitable";
    }
    if (reasons.length === 0) {
        reasons.push("General assessment based on simulated data.");
    }

    return { suitability: suitability, reasons: reasons };
}

// Function to determine the best crop recommendation (simulated - no API call)
async function determineBestCropRecommendation(fieldData, desiredCropSuitability) {
    let recommendedCrop = "";
    let reasons = [];
    const desiredCropLower = fieldData.desiredCrop ? fieldData.desiredCrop.toLowerCase() : '';

    // Case 1: Desired crop is suitable.
    if (desiredCropLower && desiredCropSuitability.suitability !== "Not Recommended" && desiredCropSuitability.suitability !== "Uncertain") {
        recommendedCrop = fieldData.desiredCrop;
        reasons.push(`Your desired crop (${fieldData.desiredCrop}) is ${desiredCropSuitability.suitability.toLowerCase()} for this field.`);
        reasons.push(...desiredCropSuitability.reasons);
    }
    // Case 2: Desired crop is NOT recommended or Uncertain. Find an alternative.
    else {
        if (desiredCropLower && desiredCropSuitability.suitability === "Not Recommended") {
            reasons.push(`Your desired crop (${fieldData.desiredCrop}) is ${desiredCropSuitability.suitability.toLowerCase()} for this field due to:`);
            reasons.push(...desiredCropSuitability.reasons);
            reasons.push("Therefore, we recommend an alternative crop that is more suitable for your field's conditions.");
        } else if (desiredCropLower && desiredCropSuitability.suitability === "Uncertain") {
            reasons.push(`Suitability for your desired crop (${fieldData.desiredCrop}) is uncertain based on available data.`);
            reasons.push("We recommend an alternative crop with higher certainty for your field's conditions.");
        } else {
            // No desired crop or suitability is N/A
            reasons.push("Based on an analysis of your field's conditions, here is our best crop recommendation.");
        }

        // Determine alternative best crop
        let alternativeCrops = [];

        // Add general recommendations based on field conditions
        if (fieldData.soilType === "Loamy" && fieldData.predictedWaterSource.suitability === "Highly Suitable") {
            alternativeCrops.push({ name: "Wheat", reason: "Loamy soil and highly suitable water source are excellent for wheat." });
        }
        if (fieldData.soilType === "Clayey" && fieldData.satelliteData.rainfallPrediction.includes("high")) {
            alternativeCrops.push({ name: "Rice", reason: "Clayey soil and high rainfall are ideal conditions for rice cultivation." });
        }
        if (fieldData.budget && parseFloat(fieldData.budget) > 10000) {
            alternativeCrops.push({ name: "Tomatoes", reason: "Sufficient budget allows for investment in irrigation and pest control for tomatoes, offering high market value." });
        }
        // General fallback if no specific conditions are met
        alternativeCrops.push({ name: "Corn", reason: "Corn is a versatile crop suitable for a range of soil types and moderate water availability, making it a good general recommendation." });
        alternativeCrops.push({ name: "Soybeans", reason: "Soybeans are good for soil health and can thrive in various conditions." });
        alternativeCrops.push({ name: "Potatoes", reason: "Potatoes are a hardy crop that can adapt to different climates and soil types." });


        // Filter out the *desired crop* if it was explicitly "Not Recommended" or "Uncertain"
        const finalRecommendedCrops = alternativeCrops.filter(crop =>
            !(desiredCropLower && (desiredCropSuitability.suitability === "Not Recommended" || desiredCropSuitability.suitability === "Uncertain") && crop.name.toLowerCase() === desiredCropLower)
        );

        if (finalRecommendedCrops.length > 0) {
            recommendedCrop = finalRecommendedCrops[0].name;
            reasons.push(finalRecommendedCrops[0].reason);
        } else {
            // This case should ideally not be hit if "Corn" is always a fallback, but for robustness:
            recommendedCrop = "A generally suitable crop";
            reasons.push("We recommend a generally suitable crop based on overall conditions.");
        }
    }

    // Add some random flavor text
    if (Math.random() < 0.3) {
        reasons.push("Further analysis with real-time data could refine this recommendation.");
    }

    return { recommendedCrop: recommendedCrop, reasons: reasons };
}

// Function to simulate climate risk alerts
function simulateClimateRisk(desiredCrop, rainfallPrediction, soilMoistureIndex, seasonalForecast, elevation, slopeData) {
    let floodRisk = "Low";
    let droughtRisk = "Low";

    // Simple logic for flood risk
    // Convert rainfallPrediction to a number (assuming "XX.X mm/month")
    const rainfallValue = parseFloat(rainfallPrediction.split(' ')[0]);

    if (rainfallValue > 80 || seasonalForecast.includes("Wet Season")) {
        floodRisk = "Medium";
    }
    if (rainfallValue > 150 || (seasonalForecast.includes("Wet Season") && parseFloat(slopeData) < 2)) {
        floodRisk = "High";
    }

    // Simple logic for drought risk
    const soilMoistureValue = parseFloat(soilMoistureIndex);
    if (soilMoistureValue < 0.3 || seasonalForecast.includes("Dry Spell")) {
        droughtRisk = "Medium";
    }
    if (soilMoistureValue < 0.15 || (seasonalForecast.includes("Dry Spell") && desiredCrop.toLowerCase().includes("wheat"))) { // Wheat can be sensitive to drought
        droughtRisk = "High";
    }

    return { floodRisk, droughtRisk };
}

// Function to simulate crop rotation planning
function simulateCropRotationPlanner(desiredCrop, soilType) {
    let rotationStrategy = "Standard 3-Year Rotation";
    let recommendedCrops = [];
    let benefits = [];

    if (desiredCrop.toLowerCase().includes("wheat")) {
        rotationStrategy = "Wheat-Legume-Fallow Rotation";
        recommendedCrops = ["Wheat", "Alfalfa (Legume)", "Corn"];
        benefits = [
            "Nitrogen fixation by legumes improves soil fertility.",
            "Disrupts pest and disease cycles specific to wheat.",
            "Improves soil structure and organic matter."
        ];
    } else if (desiredCrop.toLowerCase().includes("corn")) {
        rotationStrategy = "Corn-Soybean-Wheat Rotation";
        recommendedCrops = ["Corn", "Soybean", "Wheat"]; // Corrected typo here
        benefits = [
            "Soybeans fix nitrogen, reducing fertilizer needs for corn.",
            "Diversifies root systems, improving soil aggregation.",
            "Reduces soil erosion and nutrient runoff."
        ];
    } else if (desiredCrop.toLowerCase().includes("tomatoes")) {
        rotationStrategy = "Vegetable-Cover Crop Rotation";
        recommendedCrops = ["Tomatoes", "Cabbage", "Clover (Cover Crop)"];
        benefits = [
            "Breaks disease cycles common to solanaceous crops.",
            "Cover crops suppress weeds and prevent nutrient leaching.",
            "Enhances soil biodiversity."
        ];
    } else {
        rotationStrategy = "General Diversified Rotation";
        recommendedCrops = ["Legumes (e.g., Beans)", "Root Vegetables (e.g., Carrots)", "Leafy Greens (e.g., Spinach)"];
        benefits = [
            "Maintains soil fertility through diverse nutrient demands.",
            "Reduces reliance on a single crop, mitigating risk.",
            "Promotes a healthy soil microbiome."
        ];
    }

    if (soilType === "Sandy") {
        benefits.push("Helps increase organic matter and water retention in sandy soils.");
    } else if (soilType === "Clayey") {
        benefits.push("Improves drainage and prevents compaction in clayey soils.");
    }

    return { rotationStrategy, recommendedCrops, benefits };
}


// Function to populate and show the analysis results page
function showAnalysisResults(data) {
    currentAnalysisData = data; // Store the data globally for PDF generation
    document.getElementById('main-app-content').classList.add('hidden'); // Hide main form
    document.getElementById('analysisResultsPage').classList.remove('hidden'); // Show results page

    document.getElementById('resultReferralId').textContent = data.referralId;
    document.getElementById('resultFieldLocation').textContent = data.fieldLocation ? `${data.fieldLocation.lat.toFixed(4)}, ${data.fieldLocation.lng.toFixed(4)}` : 'N/A';
    document.getElementById('resultSoilType').textContent = data.soilType;
    document.getElementById('resultPredictedWaterSource').textContent = `${data.predictedWaterSource.type} (${data.predictedWaterSource.suitability})`;
    document.getElementById('resultManualWaterSource').textContent = data.manualWaterSource ? `${data.manualWaterSource.type} (${data.manualWaterSource.suitability})` : 'N/A';
    document.getElementById('resultBudget').textContent = data.budget ? `$${data.budget}` : 'N/A';
    document.getElementById('resultTools').textContent = data.availableTools ? data.availableTools : 'N/A';
    document.getElementById('resultDesiredCrop').textContent = data.desiredCrop || 'N/A'; // Display desired crop

    document.getElementById('resultRainfall').textContent = data.satelliteData.rainfallPrediction;
    document.getElementById('resultSoilMoisture').textContent = data.satelliteData.soilMoistureIndex;
    document.getElementById('resultTemperature').textContent = data.satelliteData.temperature;
    document.getElementById('resultSeasonalForecast').textContent = data.satelliteData.seasonalForecast;
    document.getElementById('resultElevation').textContent = data.satelliteData.landElevation;
    document.getElementById('resultSlope').textContent = data.satelliteData.slopeData;

    // Display Climate Risk Alerts
    document.getElementById('resultFloodRisk').textContent = data.climateRisks.floodRisk;
    document.getElementById('resultDroughtRisk').textContent = data.climateRisks.droughtRisk;

    // Display desired crop suitability results
    document.getElementById('resultCropName').textContent = data.desiredCrop || 'Selected Crop';
    document.getElementById('resultCropSuitability').textContent = data.cropSuitability.suitability;
    const reasonsList = document.getElementById('resultCropSuitabilityReasons');
    reasonsList.innerHTML = ''; // Clear previous reasons
    if (data.cropSuitability.reasons && data.cropSuitability.reasons.length > 0) {
        data.cropSuitability.reasons.forEach(reason => {
            const listItem = document.createElement('li');
            listItem.textContent = reason;
            reasonsList.appendChild(listItem);
        });
    } else {
        const listItem = document.createElement('li');
        listItem.textContent = "No specific reasons provided.";
        reasonsList.appendChild(listItem);
    }

    // Display best crop recommendation results
    document.getElementById('resultBestCropRecommendation').textContent = data.bestCropRecommendation.recommendedCrop;
    const bestCropReasonsList = document.getElementById('resultBestCropRecommendationReasons');
    bestCropReasonsList.innerHTML = ''; // Clear previous reasons
    if (data.bestCropRecommendation.reasons && data.bestCropRecommendation.reasons.length > 0) {
        data.bestCropRecommendation.reasons.forEach(reason => {
            const listItem = document.createElement('li');
            listItem.textContent = reason;
            bestCropReasonsList.appendChild(listItem);
        });
    } else {
        const listItem = document.createElement('li');
        listItem.textContent = "No specific reasons provided for best crop recommendation.";
        bestCropReasonsList.appendChild(listItem);
    }

    // Display Crop Rotation Planner results
    document.getElementById('resultRotationStrategy').textContent = data.cropRotationPlanner.rotationStrategy;
    const rotationCropsList = document.getElementById('resultRotationCrops');
    rotationCropsList.innerHTML = '';
    if (data.cropRotationPlanner.recommendedCrops && data.cropRotationPlanner.recommendedCrops.length > 0) {
        data.cropRotationPlanner.recommendedCrops.forEach(crop => {
            const listItem = document.createElement('li');
            listItem.textContent = crop;
            rotationCropsList.appendChild(listItem);
        });
    } else {
        const listItem = document.createElement('li');
        listItem.textContent = "No specific crops recommended for rotation.";
        rotationCropsList.appendChild(listItem);
    }
    const rotationBenefitsList = document.getElementById('resultRotationBenefits');
    rotationBenefitsList.innerHTML = '';
    if (data.cropRotationPlanner.benefits && data.cropRotationPlanner.benefits.length > 0) {
        data.cropRotationPlanner.benefits.forEach(benefit => {
            const listItem = document.createElement('li');
            listItem.textContent = benefit;
            rotationBenefitsList.appendChild(listItem);
        });
    } else {
        const listItem = document.createElement('li');
        listItem.textContent = "No specific benefits listed.";
        rotationBenefitsList.appendChild(listItem);
    }


    document.getElementById('resultIdealSoil').textContent = data.recommendations.idealSoil;
    document.getElementById('resultIdealWater').textContent = data.recommendations.idealWater;
    document.getElementById('resultIdealTemperature').textContent = data.recommendations.idealTemperature;
    document.getElementById('resultGrowingSeason').textContent = data.recommendations.growingSeason;
    document.getElementById('resultExpectedYield').textContent = data.recommendations.expectedYield;
    document.getElementById('resultRequiredInputs').textContent = data.recommendations.requiredInputs;
}

// Function to generate and download the PDF
function downloadAnalysisPdf() {
    // Ensure jsPDF is loaded
    if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF === 'undefined') {
        console.error("jsPDF library not loaded. Cannot generate PDF.");
        // Potentially show a user-friendly message
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    let yOffset = 10;
    const margin = 10;
    const lineHeight = 7;
    const sectionSpacing = 10;

    doc.setFontSize(18);
    doc.text("AgroAI: Field Analysis Report", margin, yOffset);
    yOffset += sectionSpacing;

    doc.setFontSize(14);
    doc.text("Field Summary", margin, yOffset);
    yOffset += lineHeight;
    doc.setFontSize(12);
    doc.text(`Referral ID: ${currentAnalysisData.referralId || 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text(`Field Location: ${currentAnalysisData.fieldLocation ? `${currentAnalysisData.fieldLocation.lat.toFixed(4)}, ${currentAnalysisData.fieldLocation.lng.toFixed(4)}` : 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text(`Detected Soil Type: ${currentAnalysisData.soilType || 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text(`Predicted Water Source: ${currentAnalysisData.predictedWaterSource ? `${currentAnalysisData.predictedWaterSource.type} (${currentAnalysisData.predictedWaterSource.suitability})` : 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text(`Manual Water Source: ${currentAnalysisData.manualWaterSource ? `${currentAnalysisData.manualWaterSource.type} (${currentAnalysisData.manualWaterSource.suitability})` : 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text(`Estimated Budget: ${currentAnalysisData.budget ? `$${currentAnalysisData.budget}` : 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text(`Available Tools: ${currentAnalysisData.availableTools || 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text(`Desired Crop: ${currentAnalysisData.desiredCrop || 'N/A'}`, margin, yOffset);
    yOffset += sectionSpacing;

    doc.setFontSize(14);
    doc.text("Satellite Data & Forecasts", margin, yOffset);
    yOffset += lineHeight;
    doc.setFontSize(12);
    doc.text(`Rainfall Prediction: ${currentAnalysisData.satelliteData ? currentAnalysisData.satelliteData.rainfallPrediction : 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text(`Soil Moisture Index: ${currentAnalysisData.satelliteData ? currentAnalysisData.satelliteData.soilMoistureIndex : 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text(`Temperature: ${currentAnalysisData.satelliteData ? currentAnalysisData.satelliteData.temperature : 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text(`Seasonal Forecast: ${currentAnalysisData.satelliteData ? currentAnalysisData.satelliteData.seasonalForecast : 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text(`Land Elevation: ${currentAnalysisData.satelliteData ? currentAnalysisData.satelliteData.landElevation : 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text(`Slope Data: ${currentAnalysisData.satelliteData ? currentAnalysisData.satelliteData.slopeData : 'N/A'}`, margin, yOffset);
    yOffset += sectionSpacing;

    // Add Climate Risk Alerts to PDF
    doc.setFontSize(14);
    doc.text("Climate Risk Alerts", margin, yOffset);
    yOffset += lineHeight;
    doc.setFontSize(12);
    doc.text(`Flood Risk: ${currentAnalysisData.climateRisks ? currentAnalysisData.climateRisks.floodRisk : 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text(`Drought Risk: ${currentAnalysisData.climateRisks ? currentAnalysisData.climateRisks.droughtRisk : 'N/A'}`, margin, yOffset);
    yOffset += sectionSpacing;

    doc.setFontSize(14);
    doc.text("Desired Crop Suitability Analysis", margin, yOffset);
    yOffset += lineHeight;
    doc.setFontSize(12);
    doc.text(`Possibility of Growing ${currentAnalysisData.desiredCrop || 'Selected Crop'}: ${currentAnalysisData.cropSuitability ? currentAnalysisData.cropSuitability.suitability : 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text("Reasons:", margin, yOffset);
    yOffset += lineHeight;
    if (currentAnalysisData.cropSuitability && currentAnalysisData.cropSuitability.reasons && currentAnalysisData.cropSuitability.reasons.length > 0) {
        currentAnalysisData.cropSuitability.reasons.forEach(reason => {
            doc.text(`- ${reason}`, margin + 5, yOffset);
            yOffset += lineHeight;
        });
    } else {
        doc.text("- No specific reasons provided.", margin + 5, yOffset);
        yOffset += lineHeight;
    }
    yOffset += sectionSpacing;

    doc.setFontSize(14);
    doc.text("Best Crop Recommendation", margin, yOffset);
    yOffset += lineHeight;
    doc.setFontSize(12);
    doc.text(`Recommended Crop: ${currentAnalysisData.bestCropRecommendation ? currentAnalysisData.bestCropRecommendation.recommendedCrop : 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text("Recommendation Reasons:", margin, yOffset);
    yOffset += lineHeight;
    if (currentAnalysisData.bestCropRecommendation && currentAnalysisData.bestCropRecommendation.reasons && currentAnalysisData.bestCropRecommendation.reasons.length > 0) {
        currentAnalysisData.bestCropRecommendation.reasons.forEach(reason => {
            doc.text(`- ${reason}`, margin + 5, yOffset);
            yOffset += lineHeight;
        });
    } else {
        doc.text("- No specific reasons provided for best crop recommendation.", margin + 5, yOffset);
        yOffset += lineHeight;
    }
    yOffset += sectionSpacing;

    // Add Crop Rotation Planner to PDF
    doc.setFontSize(14);
    doc.text("Crop Rotation Planner", margin, yOffset);
    yOffset += lineHeight;
    doc.setFontSize(12);
    doc.text(`Rotation Strategy: ${currentAnalysisData.cropRotationPlanner ? currentAnalysisData.cropRotationPlanner.rotationStrategy : 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text("Recommended Crops for Rotation:", margin, yOffset);
    yOffset += lineHeight;
    if (currentAnalysisData.cropRotationPlanner && currentAnalysisData.cropRotationPlanner.recommendedCrops && currentAnalysisData.cropRotationPlanner.recommendedCrops.length > 0) {
        currentAnalysisData.cropRotationPlanner.recommendedCrops.forEach(crop => {
            doc.text(`- ${crop}`, margin + 5, yOffset);
            yOffset += lineHeight;
        });
    } else {
        doc.text("- No specific crops recommended for rotation.", margin + 5, yOffset);
        yOffset += lineHeight;
    }
    doc.text("Benefits:", margin, yOffset);
    yOffset += lineHeight;
    if (currentAnalysisData.cropRotationPlanner && currentAnalysisData.cropRotationPlanner.benefits && currentAnalysisData.cropRotationPlanner.benefits.length > 0) {
        currentAnalysisData.cropRotationPlanner.benefits.forEach(benefit => {
            doc.text(`- ${benefit}`, margin + 5, yOffset);
            yOffset += lineHeight;
        });
    } else {
        doc.text("- No specific benefits listed.", margin + 5, yOffset);
        yOffset += lineHeight;
    }
    yOffset += sectionSpacing;


    doc.setFontSize(14);
    doc.text("Crop Planning Recommendations", margin, yOffset);
    yOffset += lineHeight;
    doc.setFontSize(12);
    doc.text(`Ideal Soil: ${currentAnalysisData.recommendations ? currentAnalysisData.recommendations.idealSoil : 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text(`Ideal Water Source: ${currentAnalysisData.recommendations ? currentAnalysisData.recommendations.idealWater : 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text(`Ideal Temperature Range: ${currentAnalysisData.recommendations ? currentAnalysisData.recommendations.idealTemperature : 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text(`Optimal Growing Season: ${currentAnalysisData.recommendations ? currentAnalysisData.recommendations.growingSeason : 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text(`Expected Yield: ${currentAnalysisData.recommendations ? currentAnalysisData.recommendations.expectedYield : 'N/A'}`, margin, yOffset);
    yOffset += lineHeight;
    doc.text(`Required Inputs: ${currentAnalysisData.recommendations ? currentAnalysisData.recommendations.requiredInputs : 'N/A'}`, margin, yOffset);
    yOffset += sectionSpacing;

    const filename = `AgroAI_Analysis_${currentAnalysisData.referralId || 'Report'}.pdf`;
    doc.save(filename);
}

// Event listener for submitting budget and tools
async function submitBudgetAndTools() {
    const budget = document.getElementById('budget').value;
    const availableTools = document.getElementById('availableTools').value;
    const desiredCrop = document.getElementById('desiredCrop').value.trim(); // Get desired crop

    // Get modal elements for initial submission check
    const modalOverlay = document.getElementById('confirmationModalOverlay');
    const modalTitle = document.getElementById('modalTitle');
    const modalMessage = document.getElementById('modalMessage');
    const modalPredictedLat = document.getElementById('modalPredictedLat');
    const modalPredictedLng = document.getElementById('modalPredictedLng');

    // Hide predicted lat/lng fields for this modal usage
    modalPredictedLat.style.display = 'none';
    modalPredictedLng.style.display = 'none';

    // Check if all fields are empty
    if (!budget && !availableTools && !desiredCrop) {
        modalTitle.textContent = "Submission Required";
        modalMessage.innerHTML = "Please enter at least one field (budget, tools, or desired crop) to submit.";
        modalOverlay.style.display = 'flex';
        return; // Stop the function if no data is provided
    }
    
    // Show analysis loading screen
    document.getElementById('analysisOverlay').style.display = 'flex';

    // Simulate satellite analysis and data collection
    const satelliteData = {
        rainfallPrediction: `${(Math.random() * 100).toFixed(1)} mm/month`,
        soilMoistureIndex: `${(Math.random() * 0.5 + 0.2).toFixed(2)}`, // 0.20-0.70
        temperature: `${(Math.random() * 20 + 15).toFixed(1)}°C`, // 15-35°C
        seasonalForecast: ["Normal", "Dry Spell Expected", "Wet Season Ahead"][Math.floor(Math.random() * 3)],
        landElevation: `${(Math.random() * 1000 + 50).toFixed(0)} meters`,
        slopeData: `${(Math.random() * 10).toFixed(1)}%`
    };

    const soilType = document.getElementById('soilTypeDisplay').textContent;
    const predictedWaterSourceSuitability = document.getElementById('predictedWaterSuitability').textContent;

    // Determine desired crop suitability using the new function
    const cropSuitability = await determineCropSuitability(desiredCrop, soilType, predictedWaterSourceSuitability, satelliteData);

    // Simulate climate risk alerts
    const climateRisks = simulateClimateRisk(
        desiredCrop,
        satelliteData.rainfallPrediction,
        satelliteData.soilMoistureIndex,
        satelliteData.seasonalForecast,
        satelliteData.landElevation,
        satelliteData.slopeData
    );

    // Simulate crop rotation planning
    const cropRotationPlanner = simulateCropRotationPlanner(desiredCrop, soilType);

    const fieldData = {
        referralId: referralId,
        fieldLocation: fieldLocationMarker ? { lat: fieldLocationMarker.getLatLng().lat, lng: fieldLocationMarker.getLatLng().lng } : null,
        soilType: soilType,
        predictedWaterSource: {
            type: document.getElementById('predictedWaterSourceType').textContent,
            suitability: predictedWaterSourceSuitability,
            coords: predictedWaterSourceCoords
        },
        manualWaterSource: manualWaterSourceCoords.lat !== null ? {
            type: document.getElementById('manualWaterSourceType').textContent,
            suitability: document.getElementById('manualWaterSuitability').textContent,
            coords: manualWaterSourceCoords
        } : null,
        budget: budget,
        availableTools: availableTools,
        desiredCrop: desiredCrop, // Add desired crop to field data
        cropSuitability: cropSuitability, // Add desired crop suitability results
        satelliteData: satelliteData,
        climateRisks: climateRisks, // Add climate risks to field data
        cropRotationPlanner: cropRotationPlanner, // Add crop rotation planner data
        recommendations: {
            idealSoil: ["Loamy", "Silty", "Clay Loam"][Math.floor(Math.random() * 3)],
            idealWater: ["River Water", "Rainwater Harvesting", "Groundwater (Aquifer)"][Math.floor(Math.random() * 3)],
            idealTemperature: `${(Math.random() * 10 + 20).toFixed(1)}-${(Math.random() * 5 + 30).toFixed(1)}°C`,
            growingSeason: ["Spring-Summer", "Autumn-Winter", "Year-Round (with irrigation)"][Math.floor(Math.random() * 3)],
            expectedYield: `${(Math.random() * 5 + 2).toFixed(1)} tons/hectare`,
            requiredInputs: ["Fertilizers", "Pesticides", "Improved Seeds", "Irrigation System"][Math.floor(Math.random() * 4)]
        }
    };
    
    // Determine best crop recommendation
    const bestCropRecommendation = await determineBestCropRecommendation(fieldData, cropSuitability); // Pass cropSuitability
    fieldData.bestCropRecommendation = bestCropRecommendation; // Add to fieldData

    try {
        // Save data to Firestore
        if (db && userId && appId && referralId) {
            const docRef = doc(db, `artifacts/${appId}/users/${userId}/field_data`, referralId);
            await setDoc(docRef, fieldData);
            console.log("Document successfully written with ID:", referralId);
        } else {
            console.warn("Firestore not initialized or missing required IDs. Data not saved.");
        }
    } catch (e) {
        console.error("Error adding document: ", e);
        // Potentially show an error message to the user
    }

    // Simulate analysis time
    setTimeout(() => {
        document.getElementById('analysisOverlay').style.display = 'none'; // Hide analysis screen
        showAnalysisResults(fieldData); // Show analysis results page with the collected data
    }, 3000); // 3 seconds delay
}


// Event Listeners
window.onload = async function() { // Made window.onload async
    await initializeFirebase(); // Await Firebase initialization
    initMap();
    generateReferralId(); // Generate initial ID on load

    document.getElementById('getGpsLocationBtn').addEventListener('click', getGpsLocation);
    document.getElementById('showManualCoordsBtn').addEventListener('click', showManualCoords);
    document.getElementById('submitManualCoordsBtn').addEventListener('click', submitManualCoords);
    document.getElementById('searchManualLocationBtn').addEventListener('click', searchManualLocation);
    document.getElementById('toggleSatelliteViewBtn').addEventListener('click', toggleSatelliteView); // New event listener
    document.getElementById('goToWaterSourceBtn').addEventListener('click', goToWaterSourceLocation); // New event listener for predicted water source button
    document.getElementById('selectWaterSourceManuallyBtn').addEventListener('click', enableManualWaterSourceSelection); // New event listener for manual water source selection
    document.getElementById('goToManualWaterSourceBtn').addEventListener('click', goToManualWaterSourceLocation); // New event listener for view manually selected source
    document.getElementById('submitBudgetToolsBtn').addEventListener('click', submitBudgetAndTools); // New event listener for budget/tools button
    document.getElementById('downloadPdfBtn').addEventListener('click', downloadAnalysisPdf); // New event listener for PDF download button
    document.getElementById('restoreIdBtn').addEventListener('click', showRestoreIdModal); // New event listener for restore ID button
    document.getElementById('submitRestoreIdBtn').addEventListener('click', handleRestoreFieldData); // New event listener for submit restore ID button
};

// Service Worker related functions
function showRestoreIdModal() {
    document.getElementById('restoreIdModalOverlay').style.display = 'flex';
    document.getElementById('restoreFieldIdInput').value = ''; // Clear previous input
    document.getElementById('restoreStatus').textContent = ''; // Clear status
}

async function handleRestoreFieldData() {
    const fieldIdToRestore = document.getElementById('restoreFieldIdInput').value.trim();
    const restoreStatusDiv = document.getElementById('restoreStatus');

    if (!fieldIdToRestore) {
        restoreStatusDiv.textContent = 'Please enter a Referral ID.';
        restoreStatusDiv.className = 'text-sm text-red-500 mt-2 text-center';
        return;
    }

    restoreStatusDiv.textContent = 'Restoring data...';
    restoreStatusDiv.className = 'text-sm text-green-600 mt-2 text-center';

    try {
        if (!db || !userId || !appId) {
            console.error("Firestore not initialized or missing required IDs. Data not saved.");
            restoreStatusDiv.textContent = 'Error: Database not ready.';
            restoreStatusDiv.className = 'text-sm text-red-500 mt-2 text-center';
            return;
        }

        const docRef = doc(db, `artifacts/${appId}/users/${userId}/field_data`, fieldIdToRestore);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            populateFormWithRestoredData(data);
            restoreStatusDiv.textContent = 'Data restored successfully!';
            restoreStatusDiv.className = 'text-sm text-green-500 mt-2 text-center';
            setTimeout(() => {
                document.getElementById('restoreIdModalOverlay').style.display = 'none';
            }, 1500); // Hide modal after a short delay
        } else {
            restoreStatusDiv.textContent = 'No data found for this ID.';
            restoreStatusDiv.className = 'text-sm text-red-500 mt-2 text-center';
        }
    } catch (error) {
        console.error("Error restoring document:", error);
        restoreStatusDiv.textContent = 'Error restoring data. Please try again.';
        restoreStatusDiv.className = 'text-sm text-red-500 mt-2 text-center';
    }
}

function populateFormWithRestoredData(data) {
    // Populate main form fields
    document.getElementById('latitude').value = data.fieldLocation?.lat?.toFixed(6) || '';
    document.getElementById('longitude').value = data.fieldLocation?.lng?.toFixed(6) || '';
    document.getElementById('budget').value = data.budget || '';
    document.getElementById('availableTools').value = data.availableTools || '';
    document.getElementById('desiredCrop').value = data.desiredCrop || '';

    // Update map if location data is available
    if (data.fieldLocation) {
        updateMap(data.fieldLocation.lat, data.fieldLocation.lng);
    }

    // Update displayed soil type and water source
    document.getElementById('soilTypeDisplay').textContent = data.soilType || 'N/A';
    document.getElementById('predictedWaterSourceType').textContent = data.predictedWaterSource?.type || 'N/A';
    document.getElementById('predictedWaterSuitability').textContent = data.predictedWaterSource?.suitability || 'N/A';
    predictedWaterSourceCoords = data.predictedWaterSource?.coords || { lat: null, lng: null };

    if (data.manualWaterSource) {
        document.getElementById('manualWaterSourceType').textContent = data.manualWaterSource.type;
        document.getElementById('manualWaterSuitability').textContent = data.manualWaterSource.suitability;
        manualWaterSourceCoords = data.manualWaterSource.coords;
        document.getElementById('goToManualWaterSourceBtn').style.display = 'flex'; // Show button
        if (manualWaterSourceMarker) {
            manualWaterSourceMarker.setLatLng([manualWaterSourceCoords.lat, manualWaterSourceCoords.lng]);
        } else {
            manualWaterSourceMarker = L.marker([manualWaterSourceCoords.lat, manualWaterSourceCoords.lng], {
                icon: L.divIcon({
                    className: 'custom-div-icon',
                    html: '<i class="fa-solid fa-droplet text-green-400 text-2xl"></i>',
                    iconSize: [30, 30],
                    iconAnchor: [15, 30]
                })
            }).addTo(map);
        }
        manualWaterSourceMarker.bindPopup("Manually Selected Water Source (Restored)").openPopup();

    } else {
        document.getElementById('manualWaterSourceType').textContent = 'N/A';
        document.getElementById('manualWaterSuitability').textContent = 'N/A';
        document.getElementById('goToManualWaterSourceBtn').style.display = 'none'; // Hide button
        if (manualWaterSourceMarker) {
            map.removeLayer(manualWaterSourceMarker);
            manualWaterSourceMarker = null;
        }
        manualWaterSourceCoords = { lat: null, lng: null };
    }

    // Update referral ID display
    referralId = data.referralId || '';
    document.getElementById('referralIdDisplay').textContent = referralId;

    // Display a success message or update status
    document.getElementById('locationStatus').textContent = 'Field data restored from ID!';
    document.getElementById('locationStatus').className = 'text-sm text-green-500 mt-2 text-center';
}

// Register Service Worker for offline capabilities
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/service-worker.js')
            .then(registration => {
                console.log('Service Worker registered with scope:', registration.scope);
            })
            .catch(error => {
                console.error('Service Worker registration failed:', error);
            });
    });
}
