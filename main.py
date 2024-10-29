from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI
import os
from dotenv import load_dotenv
from fastapi.responses import JSONResponse
import pandas as pd
import sys
from io import StringIO
import re
import json

# Load environment variables from .env file
load_dotenv()

app = FastAPI()

# Mount the static directory
app.mount("/static", StaticFiles(directory="static"), name="static")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this to restrict allowed origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load OpenAI API key from environment variable
client = OpenAI(
    api_key=os.environ.get("OPENAI_API_KEY"),
)

# Global variable to store the dataset path
DATASET_PATH = 'static/uploads/dataset.csv'

# Define request and response models
class QueryRequest(BaseModel):
    question: str

class QueryResponse(BaseModel):
    response: str

def sanitize_input(query: str) -> str:
    """Sanitize input to the Python REPL."""
    query = re.sub(r"^(\s|`)*(?i:python)?\s*", "", query)
    query = re.sub(r"(\s|`)*$", "", query)
    return query

def execute_panda_dataframe_code(code):
    """
    Execute the given Python code and return the output.
    """
    try:
        # Load the dataset
        df = pd.read_csv(DATASET_PATH)
    except FileNotFoundError:
        return "Dataset not found. Please upload a dataset."

    old_stdout = sys.stdout
    sys.stdout = mystdout = StringIO()
    try:
        local_env = {'df': df}
        cleaned_code = sanitize_input(code)
        exec(cleaned_code, {}, local_env)
        sys.stdout = old_stdout
        return mystdout.getvalue().strip()
    except Exception as e:
        sys.stdout = old_stdout
        return repr(e)

def generate_vega_lite_spec(query):
    """
    Generate a Vega-Lite specification based on the user's query using few-shot learning.
    """
    try:
        # Load the dataset
        df = pd.read_csv(DATASET_PATH)
    except FileNotFoundError:
        return "Error: Dataset not found. Please upload a dataset."

    # Get the column names
    column_names = ', '.join(df.columns.tolist())

    # Few-shot examples
    examples = [
        {
            "user_query": "Create a bar chart showing the average horsepower for each number of cylinders.",
            "vega_lite_spec": {
                "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
                "description": "A bar chart showing the average horsepower for each number of cylinders.",
                "data": {"name": "dataset"},
                "mark": "bar",
                "encoding": {
                    "x": {"field": "cylinders", "type": "ordinal", "axis": {"title": "Number of Cylinders"}},
                    "y": {
                        "field": "horsepower",
                        "aggregate": "mean",
                        "type": "quantitative",
                        "axis": {"title": "Average Horsepower"}
                    }
                }
            }
        },
        {
            "user_query": "Plot a scatter chart of horsepower versus weight.",
            "vega_lite_spec": {
                "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
                "description": "A scatter plot showing horsepower versus weight.",
                "data": {"name": "dataset"},
                "mark": "point",
                "encoding": {
                    "x": {"field": "weight", "type": "quantitative", "axis": {"title": "Weight"}},
                    "y": {"field": "horsepower", "type": "quantitative", "axis": {"title": "Horsepower"}}
                }
            }
        },
        {
            "user_query": "Create a grouped bar chart to compare values across categories and groups.",
            "vega_lite_spec": {
                "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
                "data": {
                    "values": [
                        {"category": "A", "group": "x", "value": 0.1},
                        {"category": "A", "group": "y", "value": 0.6},
                        {"category": "A", "group": "z", "value": 0.9},
                        {"category": "B", "group": "x", "value": 0.7},
                        {"category": "B", "group": "y", "value": 0.2},
                        {"category": "B", "group": "z", "value": 1.1},
                        {"category": "C", "group": "x", "value": 0.6},
                        {"category": "C", "group": "y", "value": 0.1},
                        {"category": "C", "group": "z", "value": 0.2}
                    ]
                },
                "mark": "bar",
                "encoding": {
                    "x": {"field": "category"},
                    "y": {"field": "value", "type": "quantitative"},
                    "xOffset": {"field": "group"},
                    "color": {"field": "group"}
                }
            }
        }
    ]

    # Prepare the prompt
    prompt = "You are a data visualization assistant. Given a user's query, generate a valid Vega-Lite JSON specification for the chart.\n\n"

    for example in examples:
        prompt += f"User Query:\n{example['user_query']}\n\nVega-Lite Spec:\n{json.dumps(example['vega_lite_spec'], indent=2)}\n\n"

    prompt += f"User Query:\n{query}\n\nVega-Lite Spec:\n"

    # Call the OpenAI API to generate the Vega-Lite spec
    response = client.chat.completions.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": "You are a data visualization assistant. Given a user's query, generate a valid Vega-Lite JSON specification for the chart."},
            {"role": "user", "content": prompt}
        ]
    )
    # Extract the generated text
    spec_text = response.choices[0].message.content
    print(spec_text)
    # Validate the JSON
    
    try:
        spec = json.loads(spec_text)
        print("valid_json")
        return json.dumps(spec)
    except json.JSONDecodeError as e:
        return f"Error: Invalid JSON generated. {str(e)}"


# Define the data analysis tool
execute_pandas_code_tool = {
    "name": "execute_pandas_code",
    "description": "Use this tool to perform data analysis using pandas on the dataset loaded as 'df'. You must use 'print()' to output the result.",
    "parameters": {
        "type": "object",
        "properties": {
            "code": {
                "type": "string",
                "description": "Python code using 'df' to perform data analysis and print the result."
            }
        },
        "required": ["code"]
    }
}

# Define the visualization tool
generate_vega_lite_spec_tool = {
    "name": "generate_vega_lite_spec",
    "description": "Use this tool to generate a Vega-Lite JSON specification for chart creation based on the user's query.",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The user's query for chart generation."
            }
        },
        "required": ["query"]
    }
}


tool_map = {
    "execute_pandas_code": execute_panda_dataframe_code,
    "generate_vega_lite_spec": generate_vega_lite_spec  # Ensure this function is defined
}

# List of tools
tools = [execute_pandas_code_tool, generate_vega_lite_spec_tool]


system_prompt = """
You are a data assistant capable of performing data analysis and generating charts based on a dataset. The dataset is loaded as a pandas DataFrame named 'df'.

- For data analysis queries (e.g., calculating averages, medians, filtering data), use the 'execute_pandas_code' tool. Write Python code using 'df' and **print the result using 'print()'**.

- For chart or visualization requests, use the 'generate_vega_lite_spec' tool to create a Vega-Lite JSON specification.

**Important Guidelines:**

- **Always include the outputs from any function calls in your final answer to the user, properly formatted.**
- When performing data analysis, present the results clearly.
- When generating a Vega-Lite JSON specification, include the JSON in your final answer, enclosed within triple backticks and 'json' syntax highlighting, like ```json ... ```.
- If the user asks for both data analysis and a chart, include both in your final answer.
- Do not mention any internal implementation details or that you used tools.
- Provide clear and concise answers to the user's queries.
- The final answer should be suitable for the user to read, and the JSON code blocks should be properly formatted for extraction.
"""




def query(question, system_prompt, tools, tool_map):
    try:
        df = pd.read_csv(DATASET_PATH)
        column_names = ', '.join(df.columns.tolist())
        dataset_info = f"The dataset contains the following columns: {column_names}."
    except FileNotFoundError:
        dataset_info = "The dataset is not available. Please upload a dataset."

    # Insert dataset_info into the system prompt
    system_prompt += "\n\n" + dataset_info

    messages = [{"role": "system", "content": system_prompt}]
    messages.append({"role": "user", "content": question})

    while True:
        # Send the conversation to the model with tools
        response = client.chat.completions.create(
            model="gpt-4",
            messages=messages,
            functions=tools,  # Tool definitions
            function_call="auto"  # Let the model decide when to call a function
        )

        # Extract the generated message
        response_message = response.choices[0].message

        # Check if a function call needs to be made
        if response_message.function_call:
            # Extract the function name and arguments
            function_call = response_message.function_call
            function_name = function_call.name
            arguments_str = function_call.arguments  # This is a JSON string

            # Parse arguments from JSON string
            try:
                arguments = json.loads(arguments_str)
            except json.JSONDecodeError as e:
                return f"Error parsing arguments: {str(e)}"

            print(f"Calling function '{function_name}' with arguments: {arguments}")  # Debugging

            # Get the corresponding function from the tool_map
            function_to_call = tool_map.get(function_name)
            if not function_to_call:
                return f"Function '{function_name}' not found."

            # Call the function with the extracted arguments
            function_result = function_to_call(**arguments)

            # Append the assistant's response to the messages
            messages.append({
                "role": "assistant",
                "content": None,
                "function_call": {
                    "name": function_name,
                    "arguments": arguments_str
                }
            })

            # Append the function's output to the conversation
            messages.append({
                "role": "function",
                "name": function_name,
                "content": function_result
            })

            # Continue the loop to let the assistant incorporate the function result
            continue
        else:
            # No function call, return the assistant's final answer
            messages.append({"role": "assistant", "content": response_message.content})
            return response_message.content

# In your /query endpoint
@app.post("/query", response_model=QueryResponse)
async def query_openai(request: QueryRequest):
    try:
        response_text = query(request.question, system_prompt, tools, tool_map)
        return QueryResponse(response=response_text)
    except Exception as e:
        return JSONResponse(content={"response": f"Error: {str(e)}"}, status_code=200)


@app.post("/upload-dataset")
async def upload_dataset(file: UploadFile = File(...)):
    if not file.filename.endswith('.csv'):
        return {"error": "Only CSV files are supported."}

    contents = await file.read()

    # Ensure the directory exists
    os.makedirs(os.path.dirname(DATASET_PATH), exist_ok=True)

    with open(DATASET_PATH, 'wb') as f:
        f.write(contents)

    return {"filename": file.filename}


# Root endpoint
@app.get("/")
async def read_root():
    return FileResponse('static/index.html')
