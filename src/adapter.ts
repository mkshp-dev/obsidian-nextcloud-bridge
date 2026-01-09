import { requestUrl, RequestUrlParam } from 'obsidian';

export const obsidianFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method || 'GET';
    const headers: Record<string, string> = {};

    if (init?.headers) {
        if (init.headers instanceof Headers) {
            init.headers.forEach((value, key) => {
                headers[key] = value;
            });
        } else if (Array.isArray(init.headers)) {
            init.headers.forEach(([key, value]) => {
                headers[key] = value;
            });
        } else {
            Object.assign(headers, init.headers);
        }
    }

    const req: RequestUrlParam = {
        url,
        method,
        headers,
        body: init?.body as string | ArrayBuffer,
        throw: false
    };

    // console.log('ObsidianFetch Request:', method, url, headers);

    try {
        const response = await requestUrl(req);
        // console.log('ObsidianFetch Response:', response.status, response.headers);

        // Convert headers to standard Headers object
        const responseHeaders = new Headers(response.headers);

        return new Response(response.arrayBuffer, {
            status: response.status,
            statusText: response.status.toString(), // requestUrl doesn't give statusText
            headers: responseHeaders
        });
    } catch (error) {
        console.error('Obsidian Fetch Error:', error);
        throw error;
    }
};
