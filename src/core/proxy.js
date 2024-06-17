import got from 'got';
import CookieHandler from '../lib/cookies.js';
import { setHeaders, setAgent } from '../lib/options.js';
import type from '../util/types.js';

const CONTINUE_INTERCEPT_RESOLUTION_PRIORITY = 0;
const RESPOND_INTERCEPT_RESOLUTION_PRIORITY = 0;
const ABORT_INTERCEPT_RESOLUTION_PRIORITY = 0;

// Responsible for applying proxy
const requestHandler = async (request, proxy, overrides = {}) => {
	if (request.isInterceptResolutionHandled()) return;
	// Reject non http(s) URI schemes
	if (!request.url().startsWith('http') && !request.url().startsWith('https'))
	{
		request.continue({}, CONTINUE_INTERCEPT_RESOLUTION_PRIORITY);
		return;
	}
	const cookieHandler = new CookieHandler(request);
	// Request options for GOT accounting for overrides
	const options = {
		cookieJar: await cookieHandler.getCookies(),
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
	try
	{
		const response = await got(overrides.url || request.url(), options);
		// Set cookies manually because "set-cookie" doesn't set all cookies (?)
		// Perhaps related to https://github.com/puppeteer/puppeteer/issues/5364
		const setCookieHeader = response.headers['set-cookie'];
		if (setCookieHeader)
		{
			await cookieHandler.setCookies(setCookieHeader);
			response.headers['set-cookie'] = undefined;
		}
		if (request.isInterceptResolutionHandled()) return;
		request.respond({
			status: response.statusCode,
			headers: response.headers,
			body: response.body
		}, RESPOND_INTERCEPT_RESOLUTION_PRIORITY);
	}
	catch (error)
	{
		if (request.isInterceptResolutionHandled()) return;
		request.abort('failed', ABORT_INTERCEPT_RESOLUTION_PRIORITY);
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
		if (type(data) === 'object')
		{
			if (Object.keys(data).length !== 0)
			{
				proxy = data.proxy;
				delete data.proxy;
				overrides = data;
			}
		}
		else
		{
			proxy = data;
		}
		// Skip request if proxy omitted
		if (proxy)
		{
			await requestHandler(request, proxy, overrides);
		}
		else
		{
			if (request.isInterceptResolutionHandled()) return;
			request.continue(overrides, CONTINUE_INTERCEPT_RESOLUTION_PRIORITY);
		}
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
		if (proxy)
		{
			page.on('request', f[listener]);
		}
		else
		{
			await page.setRequestInterception(false);
		}
	}
};

// Main function
const useProxy = async (target, data) => {
	useProxyPer[target.constructor.name.toLowerCase()](target, data);
};

export default useProxy;