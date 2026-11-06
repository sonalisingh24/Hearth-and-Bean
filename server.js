const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/ping', (req, res) => {
	res.json({ ok: true, message: 'The kitchen is open' });
});

app.listen(PORT, () => {
	console.log('Hearth and Bean running at http://localhost:${PORT}');
});


