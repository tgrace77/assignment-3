document.getElementById('csvFileInput').addEventListener('change', handleFileSelect, false);

let dataset = null;

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

document.getElementById('send-query').addEventListener('click', async function() {
    const query = document.getElementById('user-query').value;
    if (!dataset) {
        alert('Please upload a dataset first.');
        return;
    }
    
    const columns = Object.keys(dataset[0]);
    const dataTypes = columns.map(key => typeof dataset[0][key]);
    
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
        const spec = JSON.parse(result.response);
        
        renderChart(spec);
    } catch (error) {
        alert('Error generating the chart: ' + error.message);
    }
});

function renderChart(spec) {
    vegaEmbed('#chart-container', spec)
        .then(() => console.log('Chart rendered successfully'))
        .catch(error => alert('Error rendering chart: ' + error.message));
}
