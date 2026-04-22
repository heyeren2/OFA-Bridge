/**
 * Vercel Catch-All Proxy for Circle API
 * Routes: /circle-api/v1/stablecoinKits/swap → https://api.circle.com/v1/stablecoinKits/swap
 *
 * req.query.path is an array like ['v1', 'stablecoinKits', 'swap']
 * which we join back into a full path string.
 */
export default async function handler(req, res) {
    // Reconstruct the full path from the catch-all segments
    const pathSegments = req.query.path || [];
    const targetPath = '/' + pathSegments.join('/');

    // Preserve query string (e.g. ?foo=bar) if any
    const queryString = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    const targetUrl = `https://api.circle.com${targetPath}${queryString}`;

    console.log(`[CircleProxy] ${req.method} ${targetUrl}`);

    try {
        const response = await fetch(targetUrl, {
            method: req.method,
            headers: {
                'Content-Type': 'application/json',
                ...(req.headers.authorization && { Authorization: req.headers.authorization }),
                ...(req.headers['x-circle-kit-key'] && { 'x-circle-kit-key': req.headers['x-circle-kit-key'] }),
            },
            ...(req.method !== 'GET' && req.method !== 'HEAD' && {
                body: JSON.stringify(req.body),
            }),
        });

        const data = await response.json();
        res.status(response.status).json(data);

    } catch (error) {
        console.error('[CircleProxy] Error:', error);
        res.status(502).json({ error: 'Bad Gateway', message: error.message });
    }
}
