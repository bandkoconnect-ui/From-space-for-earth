// ECHO secure chat proxy for Netlify Functions.
// Set OPENAI_API_KEY in Netlify environment variables; never put the key in client code.
exports.handler = async (event) => {
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Use POST.' }) };
  if (!process.env.OPENAI_API_KEY) return { statusCode: 503, headers, body: JSON.stringify({ error: 'Live chat is not configured yet.' }) };
  try {
    const body = JSON.parse(event.body || '{}');
    const investigation = body.investigation || {};
    const messages = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
    if (!messages.length) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Send at least one message.' }) };
    const safeMessages = messages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 3000) }));
    const context = {
      title: String(investigation.title || 'Earth observation').slice(0, 120),
      topic: String(investigation.topic || '').slice(0, 120),
      date: String(investigation.date || '').slice(0, 40),
      sourceText: String(investigation.sourceText || '').slice(0, 1500),
      evidence: Array.isArray(investigation.evidence) ? investigation.evidence.slice(0, 8).map(x => ({ title: String(x.title || '').slice(0, 120), url: String(x.url || '').slice(0, 300) })) : []
    };
    const system = `You are ECHO, an evidence-led geospatial investigation assistant. Be conversational, specific to the user's question, and avoid repeating generic templates. Context: ${JSON.stringify(context)}. Clearly distinguish published evidence, plausible hypotheses, and unknowns. Never claim this prototype has run satellite analysis or measured an event unless the supplied context explicitly proves it. Suggest concrete next steps and cite only provided evidence URLs or well-known public source links. Do not give emergency response advice as authoritative; direct users to official local authorities for urgent decisions. Keep answers concise but useful.`;
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_MODEL || 'gpt-4.1-mini', instructions: system, input: safeMessages, max_output_tokens: 700 })
    });
    const data = await response.json();
    if (!response.ok) return { statusCode: 502, headers, body: JSON.stringify({ error: 'The AI provider did not return a response.' }) };
    let reply = data.output_text;
    if (!reply && Array.isArray(data.output)) reply = data.output.flatMap(item => item.content || []).filter(c => c.type === 'output_text').map(c => c.text).join('\n');
    if (!reply) return { statusCode: 502, headers, body: JSON.stringify({ error: 'The AI response was empty.' }) };
    return { statusCode: 200, headers, body: JSON.stringify({ reply }) };
  } catch (error) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'ECHO could not complete this request.' }) };
  }
};
