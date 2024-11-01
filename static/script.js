function extractJSON(responseText) {
    // Regular expression to match all JSON code blocks
    const jsonRegex = /```json([\s\S]*?)```/g;
    const matches = [...responseText.matchAll(jsonRegex)];
    const jsonSpecs = matches.map(match => match[1].trim());
    return jsonSpecs || [];
}


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

let dataset = null; // Ensure dataset is initialized

// Function to handle file selection and reading
function handleFileSelect(event) {
    const file = event.target.files[0];  // Only handle the first file
    if (!file) {
        document.getElementById('file-error').innerText = 'Please upload a valid CSV file.';
        return;
    }
    document.getElementById('file-error').innerText = '';

    // Create FormData to send the file
    const formData = new FormData();
    formData.append('file', file);

    // Upload the file to the backend
    fetch('/upload-dataset', {
        method: 'POST',
        body: formData
    })
    .then(response => response.json())
    .then(result => {
        if (result.error) {
            document.getElementById('file-error').innerText = result.error;
            return;
        }
        // Read the file locally for preview
        const reader = new FileReader();
        reader.onload = function(e) {
            const csvData = d3.csvParse(e.target.result, d3.autoType);
            dataset = csvData;
            previewData(csvData);

            // Reset the chat history and chart when a new dataset is loaded
            resetChatAndChart();
        };
        reader.readAsText(file);
    })
    .catch(error => {
        console.error('Error uploading file:', error);
        document.getElementById('file-error').innerText = 'Error uploading file.';
    });
}

function resetChatAndChart() {
    const chatHistory = document.getElementById('chat-history');
    chatHistory.innerHTML = '';

    const chartContainer = document.getElementById('chart-container');
    chartContainer.innerHTML = '';
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

document.getElementById('clear-messages').addEventListener('click', function() {
    const chatHistory = document.getElementById('chat-history');
    chatHistory.innerHTML = '';
});

// Event listener for the 'Send' button to process the user query
// Existing event listener for the 'Send' button
// Function to send user query
async function sendUserQuery() {
    const queryInput = document.getElementById('user-query');
    const query = queryInput.value.trim();
    const chatHistory = document.getElementById('chat-history');

    if (query === '') {
        return; // Do nothing if the input is empty
    }

    // Append user query to chat history
    chatHistory.innerHTML += `<p><strong>User:</strong> ${query}</p>`;
    chatHistory.scrollTop = chatHistory.scrollHeight;

    // Clear the input field
    queryInput.value = '';

    if (!dataset) {
        alert('Please upload a dataset first.');
        chatHistory.innerHTML += `<p><strong>System:</strong> Please upload a dataset first.</p>`;
        chatHistory.scrollTop = chatHistory.scrollHeight;
        return;
    }

    // Show the loading spinner
    document.getElementById('loading-spinner').style.display = 'block';

    try {
        const response = await fetch('/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: query })
        });

        const result = await response.json();
        console.log("Server response:", result);

        if (!result || typeof result.response !== 'string') {
            throw new Error('Invalid response from server.');
        }

        const responseText = result.response.trim();

        let specTexts = extractJSON(responseText);

        if (specTexts && specTexts.length > 0) {
            // Loop through each JSON spec and render the chart
            for (let specText of specTexts) {
                let spec;
                try {
                    spec = JSON.parse(specText);
                    await renderChart(spec, chatHistory);
                } catch (e) {
                    console.error('Error parsing JSON:', e);
                    chatHistory.innerHTML += `<p><strong>Assistant:</strong> Error parsing the chart specification.</p>`;
                    chatHistory.scrollTop = chatHistory.scrollHeight;
                }
            }
        }
    
        // Append the assistant's response excluding the JSON code blocks
        const textWithoutJSON = responseText.replace(/```json[\s\S]*?```/g, '').trim();
        if (textWithoutJSON) {
            chatHistory.innerHTML += `<p><strong>Assistant:</strong> ${textWithoutJSON}</p>`;
            chatHistory.scrollTop = chatHistory.scrollHeight;
        }
        document.getElementById('loading-spinner').style.display = 'none';
        document.getElementById('send-query').disabled = false;
    } catch (error) {
        const errorMessage = 'Error: ' + error.message;
        alert(errorMessage);
        chatHistory.innerHTML += `<p><strong>System:</strong> ${errorMessage}</p>`;
        chatHistory.scrollTop = chatHistory.scrollHeight;

        document.getElementById('loading-spinner').style.display = 'none';
        document.getElementById('send-query').disabled = false;
    }
}
document.getElementById('send-query').addEventListener('click', sendUserQuery);

// Event listener for pressing 'Enter' key in the input field
document.getElementById('user-query').addEventListener('keydown', function(event) {
    if (event.key === 'Enter') {
        event.preventDefault(); // Prevent the default action
        sendUserQuery();
    }
});

// Function to render the chart using Vega-Lite specification remains unchanged
async function renderChart(spec, chatHistory) {
    try {
        // spec is already an object, no need to parse

        // Assign the actual data to the Vega-Lite spec
        spec.data = { values: dataset };

        // Ensure the schema is set correctly
        if (!spec.$schema) {
            spec.$schema = "https://vega.github.io/schema/vega-lite/v5.json";
        }

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
        chatHistory.innerHTML += `<p><strong>Assistant:</strong></p><img src="${url}" style="max-width: 100%;"/>`;
        chatHistory.scrollTop = chatHistory.scrollHeight;

        console.log('Chart rendered successfully');
    } catch (error) {
        console.error('Error rendering chart:', error);
        alert('Error rendering chart: ' + error.message);
        chatHistory.innerHTML += `<p><strong>Assistant:</strong> Error rendering chart.</p>`;
    }
}

