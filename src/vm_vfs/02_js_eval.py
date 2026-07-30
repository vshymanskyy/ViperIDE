import js

msg = "Hello from JavaScript!"

js.eval(f"""
    // Open a new window
    const newWindow = window.open('about:blank', '_blank', 'width=500,height=300');

    // Write the HTML and JavaScript into the new window, just for fun :)
    newWindow.document.write(`
        <!DOCTYPE html>
        <html>
            <head><title>Example</title></head>
            <body>
                <div id="message"></div>
                <script>
                    // Display the message
                    document.getElementById('message').innerText = "{msg}";
                </script>
            </body>
        </html>
    `);

    // Close the document stream to finish loading
    newWindow.document.close();
""")
