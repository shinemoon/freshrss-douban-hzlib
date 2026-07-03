'use strict';

const LIBSCAN_ENTRY_SELECTOR = '.flux';
const LIBSCAN_TITLE_LINK_SELECTOR = 'a.title, a.item-element.title';
const LIBSCAN_CONTENT_SELECTOR = '.flux_content';
const LIBSCAN_BADGE_CLASS = 'libscan-indicator';
const LIBSCAN_PENDING = 'pending';
const LIBSCAN_AVAILABLE = 'available';
const LIBSCAN_MISSING = 'missing';
const LIBSCAN_ERROR = 'error';
const LIBSCAN_ENDPOINT = '?c=libscan&a=lookup';
const LIBSCAN_CACHE = new Map();
const LIBSCAN_REQUESTS = new Map();

window.addEventListener('load', () => {
	processEntries();
	observeStream();
});

function observeStream() {
	const stream = document.getElementById('stream');
	if (!stream) {
		return;
	}

	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
				processEntries();
				return;
			}
		}
	});

	observer.observe(stream, { childList: true, subtree: false });
}

function processEntries() {
	const entries = document.querySelectorAll(LIBSCAN_ENTRY_SELECTOR);
	entries.forEach((entry) => {
		if (!(entry instanceof HTMLElement) || entry.dataset.libscanProcessed === '1') {
			return;
		}

		const link = entry.querySelector(LIBSCAN_TITLE_LINK_SELECTOR);
		if (!(link instanceof HTMLAnchorElement)) {
			entry.dataset.libscanProcessed = '1';
			return;
		}

		if (!isDoubanBookUrl(link.href)) {
			entry.dataset.libscanProcessed = '1';
			return;
		}

		const title = resolveBookTitle(link);
		if (!title) {
			entry.dataset.libscanProcessed = '1';
			return;
		}

		const badges = ensureIndicators(entry, link);
		const searchUrl = buildLibrarySearchUrl(title);
		setIndicatorsState(badges, LIBSCAN_PENDING, '杭州图书馆检索中', searchUrl);
		entry.dataset.libscanProcessed = '1';
		lookupTitle(title)
			.then((result) => {
				applyLookupResult(badges, result);
			})
			.catch(() => {
				setIndicatorsState(badges, LIBSCAN_ERROR, '杭州图书馆查询失败', searchUrl);
			});
	});
}

function isDoubanBookUrl(url) {
	return /^https:\/\/book\.douban\.com\/subject\/\d+\/?(?:[?#].*)?$/i.test(url);
}

function resolveBookTitle(link) {
	const rawTitle = (link.getAttribute('title') || '').trim();
	if (rawTitle !== '') {
		return rawTitle;
	}

	const textTitle = (link.textContent || '').trim();
	return textTitle;
}

function buildLibrarySearchUrl(title) {
	const url = new URL('https://my1.zjhzlib.cn/opac/search');
	url.search = new URLSearchParams({
		q: title,
		searchType: 'standard',
		isFacet: 'true',
		view: 'standard',
		searchWay: 'title200a',
		rows: '10',
		sortWay: 'score',
		sortOrder: 'desc',
		hasholding: '1',
		searchWay0: 'marc',
		logical0: 'AND',
		curlibcode: '0000',
	}).toString();
	return url.toString();
}

function ensureIndicators(entry, link) {
	const indicators = [];
	indicators.push(ensureIndicator(link.parentElement, () => link.insertAdjacentElement('afterend', createIndicator('title')), 'title'));

	const content = entry.querySelector(LIBSCAN_CONTENT_SELECTOR);
	if (content instanceof HTMLElement) {
		indicators.push(ensureIndicator(content, () => {
			const badge = createIndicator('content');
			content.insertAdjacentElement('afterbegin', badge);
			return badge;
		}));
	}

	return indicators;
}

function ensureIndicator(container, createBadge, placement = '') {
	if (!(container instanceof HTMLElement)) {
		return null;
	}

	const selector = placement === ''
		? `.${LIBSCAN_BADGE_CLASS}`
		: `.${LIBSCAN_BADGE_CLASS}.libscan-indicator-${placement}`;
	const existing = container.querySelector(selector);
	if (existing instanceof HTMLElement) {
		return existing;
	}

	return createBadge();
}

function createIndicator(placement) {
	const badge = document.createElement('a');
	badge.className = `${LIBSCAN_BADGE_CLASS} libscan-indicator-${placement} is-${LIBSCAN_PENDING}`;
	badge.href = '#';
	badge.target = '_blank';
	badge.rel = 'noopener noreferrer';
	badge.title = '杭州图书馆检索中';
	badge.setAttribute('aria-label', '杭州图书馆检索中');

	const dot = document.createElement('span');
	dot.className = 'libscan-indicator-dot';
	badge.appendChild(dot);

	return badge;
}

function setIndicatorsState(badges, state, title, href) {
	badges.forEach((badge) => {
		if (badge instanceof HTMLElement) {
			setIndicatorState(badge, state, title, href);
		}
	});
}

function setIndicatorState(badge, state, title, href) {
	badge.classList.remove(`is-${LIBSCAN_PENDING}`, `is-${LIBSCAN_AVAILABLE}`, `is-${LIBSCAN_MISSING}`, `is-${LIBSCAN_ERROR}`);
	badge.classList.add(`is-${state}`);
	badge.title = title;
	badge.setAttribute('aria-label', title);
	badge.href = href || '#';
}

function lookupTitle(title) {
	if (LIBSCAN_CACHE.has(title)) {
		return Promise.resolve(LIBSCAN_CACHE.get(title));
	}

	if (LIBSCAN_REQUESTS.has(title)) {
		return LIBSCAN_REQUESTS.get(title);
	}

	const url = `${LIBSCAN_ENDPOINT}&title=${encodeURIComponent(title)}`;
	const request = fetch(url, {
		credentials: 'same-origin',
		headers: {
			'X-Requested-With': 'XMLHttpRequest',
		},
	})
		.then((response) => {
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			return response.json();
		})
		.then((payload) => {
			LIBSCAN_CACHE.set(title, payload);
			LIBSCAN_REQUESTS.delete(title);
			return payload;
		})
		.catch((error) => {
			LIBSCAN_REQUESTS.delete(title);
			throw error;
		});

	LIBSCAN_REQUESTS.set(title, request);
	return request;
}

function applyLookupResult(badges, result) {
	if (!result || typeof result !== 'object') {
		setIndicatorsState(badges, LIBSCAN_ERROR, '杭州图书馆查询失败');
		return;
	}

	const count = Number.isFinite(result.count) ? result.count : null;
	const searchUrl = typeof result.searchUrl === 'string' ? result.searchUrl : '#';

	if (result.status === LIBSCAN_AVAILABLE) {
		setIndicatorsState(badges, LIBSCAN_AVAILABLE, `杭州图书馆在馆 ${count ?? '?'} 本`, searchUrl);
		return;
	}

	if (result.status === LIBSCAN_MISSING) {
		setIndicatorsState(badges, LIBSCAN_MISSING, '杭州图书馆当前未检索到在馆结果', searchUrl);
		return;
	}

	setIndicatorsState(badges, LIBSCAN_ERROR, '杭州图书馆查询失败', searchUrl);
}