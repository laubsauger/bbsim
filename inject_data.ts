import * as fs from 'fs';
import * as path from 'path';

const jsonPath = path.join(process.cwd(), 'docs', 'map_data.json');
const htmlPath = path.join(process.cwd(), 'docs', 'visualize_map.html');

const jsonData = fs.readFileSync(jsonPath, 'utf8');
let htmlContent = fs.readFileSync(htmlPath, 'utf8');

// Inject data
const injection = `window.mapData = ${jsonData};`;

if (htmlContent.includes('// Placeholder for the JSON data')) {
    htmlContent = htmlContent.replace('// Placeholder for the JSON data. I will inject it using a second script or manual replace.', injection);
} else {
    const regex = /window\.mapData\s*=\s*\{[\s\S]*?\};/;
    if (regex.test(htmlContent)) {
        htmlContent = htmlContent.replace(regex, injection);
    } else {
        console.error("Could not find placeholder or existing data to replace.");
    }
}

fs.writeFileSync(htmlPath, htmlContent);
console.log('Injected JSON data into HTML.');
