import got from 'got';
import { setHeaders, setAgent } from '../lib/options.js';
import { type } from '../util/utils.js'

import Debug from 'debug';
const debug = Debug('puppeteer-page-proxy');

const CONTINUE_INTERCEPT_RESOLUTION_PRIORITY = 0;
const RESPOND_INTERCEPT_RESOLUTION_PRIORITY = 0;
const ABORT_INTERCEPT_RESOLUTION_PRIORITY = 0;

// Responsible for applying proxy
const requestHandler = async (request, proxy, overrides = {}) => {

	const url = overrides.url || request.url()
	// Reject non http(s) URI schemes
	if (!request.url().startsWith('http') && !request.url().startsWith('https')) {
		if (request.isInterceptResolutionHandled()) {
			debug("URL is not a http or https URI scheme, request already resolved by another handler, could not vote to continue", { url, priority: CONTINUE_INTERCEPT_RESOLUTION_PRIORITY });
			return;
		}

		return request.continue({}, CONTINUE_INTERCEPT_RESOLUTION_PRIORITY);
	}

	// Request options for GOT accounting for overrides
	const options = {
		method: overrides.method || request.method(),
		body: overrides.postData || request.postData(),
		headers: overrides.headers || setHeaders(request),
		agent: setAgent(proxy),
		responseType: 'buffer',
		maxRedirects: 15,
		throwHttpErrors: false,
		ignoreInvalidCookies: true,
		followRedirect: false
	};

	try {
		const response = await got(url, options);

		if (request.isInterceptResolutionHandled()) {
			const debugMessage =`Request for url=${url} already resolved by another handler, could not use proxy=${proxy} for url=${url}`
			debug(debugMessage);
			return;
		}

		debug("Proxy response received", { proxy, url, options, statusCode: response.statusCode });

		return await request.respond({
			status: response.statusCode,
			headers: response.headers,
			body: response.body
		}, RESPOND_INTERCEPT_RESOLUTION_PRIORITY);
	}
	catch (error) {
		debug("Something went wrong", { proxy, url, options, error })

		if (request.isInterceptResolutionHandled()) {
			debug("Request already resolved by another handler, could not vote to abort", { url, priority: ABORT_INTERCEPT_RESOLUTION_PRIORITY });
			return;
		}
		
		return await request.abort('failed', ABORT_INTERCEPT_RESOLUTION_PRIORITY);
	}
};

// For reassigning proxy of page
const removeRequestListener = (page, listenerName) => {
	page.removeAllListeners(`request`);
};

const useProxyPer = {
	// Call this if request object passed
	cdphttprequest: async (request, data) => {
		let proxy, overrides;
		// Separate proxy and overrides
		if (type(data) === 'object') {
			if (Object.keys(data).length !== 0) {
				proxy = data.proxy;
				delete data.proxy;
				overrides = data;
			}
		}
		else {
			proxy = data;
		}
		// Skip request if proxy omitted
		if (proxy) {
			return await requestHandler(request, proxy, overrides);
		}

		if (request.isInterceptResolutionHandled()) {
			debug("Request already resolved by another handler, could not vote to continue without proxy", { priority: CONTINUE_INTERCEPT_RESOLUTION_PRIORITY });
			return;
		}

		return request.continue(overrides, CONTINUE_INTERCEPT_RESOLUTION_PRIORITY);
	},

	// Call this if page object passed
	cdppage: async (page, proxy) => {
		await page.setRequestInterception(true);
		const listener = '$ppp_requestListener';
		removeRequestListener(page, listener);
		const f = {
			[listener]: async (request) => {
				await requestHandler(request, proxy);
			}
		};
		if (proxy) {
			page.on('request', f[listener]);
		}
		else {
			await page.setRequestInterception(false);
		}
	}
};

// Main function
const useProxy = async (target, data) => {
	return useProxyPer[target.constructor.name.toLowerCase()](target, data);
};

export default useProxy;