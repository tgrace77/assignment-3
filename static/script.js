// Event listeners
document.getElementById('csvFileInput').addEventListener('change', handleFileSelect, false);
document.getElementById('toggle-preview').addEventListener('click', togglePreview); // Event Listener for Toggle Button

// Global dataset variable
let dataset = null;

// Function to handle file selection and reading
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file.type !== 'text/csv') {
        document.getElementById('file-error').innerText = 'Please upload a valid CSV file.';
        return;
    }
    document.getElementById('file-error').innerText = '';

    const reader = new FileReader();
    reader.onload = function(e) {
        const csvData = d3.csvParse(e.target.result, d3.autoType);
        dataset = csvData;
        previewData(csvData);
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
        data.slice(0, 5).forEach(row => {
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
    if (!dataset) {
        alert('Please upload a dataset first.');
        return;
    }

    const columns = Object.keys(dataset[0]);
    const dataTypes = columns.map(key => typeof dataset[0][key]);

    // Pre-check for question relevance
    const isRelevant = columns.some(col => query.toLowerCase().includes(col.toLowerCase()));
    if (!isRelevant) {
        alert('Your question does not seem to be related to the dataset columns. Please refine your question.');
        return;
    }

    const prompt = `Generate a Vega-Lite specification for a chart based on the following dataset. 
    Columns: ${columns.join(', ')}. 
    Data types: ${dataTypes.join(', ')}.
    Sample rows: ${JSON.stringify(dataset.slice(0, 3))}. 
    User question: ${query}`;

    try {
        const response = await fetch('/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        const result = await response.json();
        
        // Check if the response is empty or undefined
        if (!result || !result.response) {
            throw new Error('Received an empty or invalid response from the server.');
        }

        // Parse the received Vega-Lite specification
        let spec;
        try {
            spec = JSON.parse(result.response);
        } catch (e) {
            throw new Error('Received an invalid JSON for the chart specification.');
        }

        // Validate the Vega-Lite specification before rendering
        if (!spec.data || !spec.mark || !spec.encoding) {
            throw new Error('Invalid Vega-Lite specification received. Please check your query.');
        }

        renderChart(spec);
    } catch (error) {
        alert('Error generating the chart: ' + error.message);
    }
});

// Function to render the chart using Vega-Lite specification
function renderChart(spec) {
    vegaEmbed('#chart-container', spec)
        .then(() => console.log('Chart rendered successfully'))
        .catch(error => alert('Error rendering chart: ' + error.message));
}
