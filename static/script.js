document.getElementById('dropzone').addEventListener('click', () => {
    document.getElementById('csvFileInput').click();
});

const dropzone = document.getElementById('dropzone');
const csvFileInput = document.getElementById('csvFileInput');

// Variable to prevent double prompts
let fileInputClicked = false;

// Trigger file input click on dropzone click
dropzone.addEventListener('click', () => {
    if (!fileInputClicked) {
        fileInputClicked = true; // Prevent multiple clicks
        csvFileInput.click();  // Trigger the file input dialog
        setTimeout(() => {
            fileInputClicked = false; // Reset after a brief delay
        }, 1000); // Adjust the delay as necessary
    }
});

// Handle file selection via input
csvFileInput.addEventListener('change', handleFileSelect);

// Add event listeners for drag-and-drop functionality
dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragging');
});

dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragging');
});

dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragging');

    const files = e.dataTransfer.files;
    if (files.length > 0) {
        const file = files[0];
        handleFileSelect({ target: { files: [file] } }); // Use the same file handling logic
    }
});

// Function to handle file selection and reading
function handleFileSelect(event) {
    const file = event.target.files[0];  // Only handle the first file
    if (!file || file.type !== 'text/csv') {
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

document.getElementById('toggle-preview').addEventListener('click', togglePreview);

function togglePreview() {
    const preview = document.getElementById('data-preview');
    preview.style.display = (preview.style.display === 'none' || preview.style.display === '') ? 'block' : 'none';
}


// Event listener for the 'Send' button to process the user query
// Existing event listener for the 'Send' button
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

    // **Use the whole dataset**
    const datasetSubset = dataset;  // Use the entire dataset

    // **Incorporate few-shot learning into the prompt with descriptions**
    const fewShotExamples = [
        {
            columns: 'Age, Height, Weight',
            dataTypes: 'number, number, number',
            userQuestion: 'Plot Height versus Age',
            vegaSpec: `{
      "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
      "description": "A scatter plot showing the relationship between Age and Height.",
      "data": {
        "name": "dataset"
      },
      "mark": "point",
      "encoding": {
        "x": {"field": "Age", "type": "quantitative"},
        "y": {"field": "Height", "type": "quantitative"}
      }
    }`
        },
        {
            columns: 'Country, Population, GDP',
            dataTypes: 'string, number, number',
            userQuestion: 'Show a bar chart of Population by Country',
            vegaSpec: `{
      "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
      "description": "A bar chart displaying the population of each country.",
      "data": {
        "name": "dataset"
      },
      "mark": "bar",
      "encoding": {
        "x": {"field": "Country", "type": "nominal"},
        "y": {"field": "Population", "type": "quantitative"}
      }
    }`
        }
    ];

    function generateFewShotPrompt(examples) {
        return examples.map((ex, idx) => {
            return `Example ${idx + 1}:
Columns: ${ex.columns}.
Data types: ${ex.dataTypes}.
Complete dataset: ${ex.dataset}.
User question: ${ex.userQuestion}.
Vega-Lite specification: ${ex.vegaSpec}.`;
        }).join('\n\n');
    }

    const fewShotPrompt = generateFewShotPrompt(fewShotExamples);

    // **Construct the new prompt emphasizing the description field**
    const prompt = `${fewShotPrompt}

    Now, based on the following columns, data types, and user question, generate a valid Vega-Lite specification in JSON format for a chart.
    
    Columns: ${columns.join(', ')}.
    Data types: ${dataTypes.join(', ')}.
    User question: ${query}.
    Your Vega-Lite specification must:
    
    - Include a detailed 'description' field explaining the chart.
    - Use 'data': {'name': 'dataset'} to refer to the dataset.
    - Be valid JSON without syntax errors (no trailing commas, correct use of braces and brackets).
    - Only return the Vega-Lite JSON specification, nothing else. Do not format the response as code (no triple quotes or backticks).
    - Ensure that the response fits the Vega-Lite Specifications.
    `;

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
        responseText = responseText.replace(/,\s*([\]}])/g, '$1');
        // Parse the received Vega-Lite specification
        let spec;
        try {
            spec = JSON.parse(responseText);
        } catch (e) {
            throw new Error('Received an invalid JSON for the chart specification.');
        }

        // **Check if the 'description' field is present**
        if (!spec.description) {
            throw new Error('The Vega-Lite specification is missing the "description" field.');
        }

        // Validate the Vega-Lite specification before rendering
        if (!spec.data || !spec.mark || !spec.encoding) {
            throw new Error('Invalid Vega-Lite specification received. Please check your query.');
        }

        // Render the chart and then save it to chat history
        const description = spec.description;

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

// Function to render the chart using Vega-Lite specification remains unchanged
// Function to render the chart using Vega-Lite specification
async function renderChart(spec, chatHistory) {
    try {
        // Assign the actual data to the Vega-Lite spec
        spec.data = { values: dataset };
        
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