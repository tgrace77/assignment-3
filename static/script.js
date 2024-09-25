// Event listeners
document.getElementById('csvFileInput').addEventListener('change', handleFileSelect);
document.getElementById('toggle-preview').addEventListener('click', togglePreview); // Event Listener for Toggle Button

// Global dataset variable
let dataset = null;

// Function to handle file selection and reading
function handleFileSelect(event) {
    const file = event.target.files[0];
    console.log('File selected:', file); // Check if file is being selected
    if (file.type !== 'text/csv') {
        document.getElementById('file-error').innerText = 'Please upload a valid CSV file.';
        return;
    }
    document.getElementById('file-error').innerText = '';

    const reader = new FileReader();
    reader.onload = function(e) {
        console.log('File content:', e.target.result); // Check if file content is being read

        // Try parsing CSV
        try {
            const csvData = d3.csvParse(e.target.result, d3.autoType);
            console.log('Parsed CSV data:', csvData); // Check if CSV is parsed
            dataset = csvData;
            previewData(csvData);
        } catch (error) {
            console.error('Error parsing CSV:', error);
        }
    };
    reader.readAsText(file);
}


// Function to preview the dataset in a table
function previewData(data) {
    const preview = document.getElementById('data-preview');
    preview.innerHTML = '';

    if (data.length > 0) {
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        Object.keys(data[0]).forEach(key => {
            const th = document.createElement('th');
            th.textContent = key;
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        const tbody = document.createElement('tbody');
        data.forEach(row => {
            const tr = document.createElement('tr');
            Object.values(row).forEach(val => {
                const td = document.createElement('td');
                td.textContent = val;
                tr.appendChild(td);
            });
            tbody.appendChild(tr);
        });

        table.appendChild(tbody);
        preview.appendChild(table);
    } else {
        preview.innerHTML = '<p>No data to preview.</p>';
    }
}

// Function to toggle the display of the data preview
function togglePreview() {
    const preview = document.getElementById('data-preview');
    if (preview.style.display === 'none' || preview.style.display === '') {
        preview.style.display = 'block';
    } else {
        preview.style.display = 'none';
    }
}

// Event listener for the 'Send' button to process the user query
document.getElementById('send-query').addEventListener('click', async function() {
    const query = document.getElementById('user-query').value;
    const chatHistory = document.getElementById('chat-history');

    // Append user query to chat history
    chatHistory.innerHTML += `<p><strong>User:</strong> ${query}</p>`;
    chatHistory.scrollTop = chatHistory.scrollHeight;

    if (!dataset) {
        alert('Please upload a dataset first.');
        chatHistory.innerHTML += `<p><strong>System:</strong> Please upload a dataset first.</p>`;
        chatHistory.scrollTop = chatHistory.scrollHeight;
        return;
    }

    const columns = Object.keys(dataset[0]);
    const dataTypes = columns.map(key => typeof dataset[0][key]);

    // Pre-check for question relevance
    const isRelevant = columns.some(col => query.toLowerCase().includes(col.toLowerCase()));

    if (!isRelevant) {
        const message = 'Your question does not seem to be related to the dataset columns. Please refine your question.';
        alert(message);
        chatHistory.innerHTML += `<p><strong>System:</strong> ${message}</p>`;
        chatHistory.scrollTop = chatHistory.scrollHeight;
        return;
    }

const threeQuartersIndex = Math.floor(dataset.length * (3 / 4));
const datasetSubset = dataset.slice(0, threeQuartersIndex);
const prompt = `Generate a valid Vega-Lite specification in JSON format for a chart based on the following dataset.
Columns: ${columns.join(', ')}. 
Data types: ${dataTypes.join(', ')}.
Complete dataset: ${JSON.stringify(datasetSubset)}.
User question: ${query}.
Only return the Vega-Lite JSON specification, nothing else. Do not format the response as code (no triple quotes or backticks).
Please include a detailed description in the Vega-lite description format, I need a description to be included in the proper format.
Do not cut the response short.
Ensure that the response fits the Vega-Lite Specifications]`;

    try {
        const response = await fetch('/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        const result = await response.json();
        console.log("Received Vega-Lite Spec: ", result.response);
        console.log("Length of response: ", result.response.length);
        

        // Check if the response is empty or undefined
        if (!result || !result.response) {
            throw new Error('Received an empty or invalid response from the server.');
        }
        let responseText = result.response.trim();
        responseText = responseText.replace(/```json/g, '').replace(/```/g, '');
        // Parse the received Vega-Lite specification
        let spec;
        try {
            spec = JSON.parse(responseText);
        } catch (e) {
            throw new Error('Received an invalid JSON for the chart specification.');
        }

        // Validate the Vega-Lite specification before rendering
        if (!spec.data || !spec.mark || !spec.encoding) {
            throw new Error('Invalid Vega-Lite specification received. Please check your query.');
        }

        // Render the chart and then save it to chat history
        const description = spec.description || "No description provided.";

        await renderChart(spec, chatHistory);
        chatHistory.innerHTML += `<p><strong>Description:</strong> ${description}</p>`;
        chatHistory.scrollTop = chatHistory.scrollHeight;
    } catch (error) {
        const errorMessage = 'Error generating the chart: ' + error.message;
        alert(errorMessage);
        chatHistory.innerHTML += `<p><strong>System:</strong> ${errorMessage}</p>`;
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }
});

// Function to render the chart using Vega-Lite specification
// Function to render the chart using Vega-Lite specification
async function renderChart(spec, chatHistory) {
    try {
        // Render the chart
        const { view } = await vegaEmbed('#chart-container', spec);

        // Wait for the view to be fully rendered
        await view.runAsync();

        // Get the SVG as a string
        const svgString = await view.toSVG();

        // Create a Blob from the SVG string and generate a URL
        const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        // Append the chart image to the chat history
        chatHistory.innerHTML += `<p><strong>System:</strong></p><img src="${url}" style="max-width: 100%;"/>`;
        chatHistory.scrollTop = chatHistory.scrollHeight;

        console.log('Chart rendered successfully');
    } catch (error) {
        alert('Error rendering chart: ' + error.message);
    }
}