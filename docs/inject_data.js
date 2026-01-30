const fs = require('fs');
const path = require('path');

const jsonPath = path.join(__dirname, 'map_data.json');
const htmlPath = path.join(__dirname, 'visualize_map.html');

const jsonData = fs.readFileSync(jsonPath, 'utf8');
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Inject data
const injection = `window.mapData = ${jsonData};`;

// Regex to replace existing window.mapData assignment or the placeholder
// Matches "window.mapData = { ... };" (assuming JSON structure) or the comment placeholder
// simplified: match everything from window.mapData = down to the generic script end or just replace the whole placeholder area if I can find a stable marker.
// Actually, I can just match the placeholder lines if they exist, OR the specific start of the variable.

if (htmlContent.includes('// Placeholder for the JSON data')) {
    htmlContent = htmlContent.replace('// Placeholder for the JSON data. I will inject it using a second script or manual replace.', injection);
} else {
    // Already injected? Replace the object.
    // robust match: window.mapData = { ... }; 
    // Since JSON is valid JS object literal here, it ends at the last "};" usually.
    // Let's use a simpler approach: Re-read the template? 
    // No, I'll just regex replace "window.mapData = [\s\S]*?;" with the new one.
    // Warning: JSON might contain semicolons in strings. 
    // But since it's the last thing in the script usually...

    // Better: Match from "window.mapData =" to the "renderMap(data);" call or next function?
    // In my HTML, `window.onload = loadMap;` follows.

    // Let's just create a FRESH HTML file from a template string if possible, or use a marker.
    // I'll stick to regex: window.mapData = \{[\s\S]*?\};
    // This relies on the JSON being a single block.
    // Since I control the JSON stringify, it's safeish.
    const regex = /window\.mapData\s*=\s*\{[\s\S]*?\};/;
    if (regex.test(htmlContent)) {
        htmlContent = htmlContent.replace(regex, injection);
    } else {
        console.error("Could not find placeholder or existing data to replace.");
    }
}

fs.writeFileSync(htmlPath, htmlContent);
console.log('Injected JSON data into HTML.');
