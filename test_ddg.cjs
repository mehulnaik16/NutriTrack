const fetch = require('node-fetch'); fetch('https://html.duckduckgo.com/html/?q=site:youtube.com+Push+Up+tutorial').then(r => r.text()).then(html => console.log(html)).catch(console.error);
