<?php

declare(strict_types=1);

final class FreshExtension_libscan_Controller extends FreshRSS_ActionController
{
	private const SEARCH_URL = 'https://my1.zjhzlib.cn/opac/search';

	#[\Override]
	public function firstAction(): void {
		if (!FreshRSS_Auth::hasAccess()) {
			Minz_Error::error(403);
		}
	}

	public function lookupAction(): void {
		$this->view->_layout(null);
		header('Content-Type: application/json; charset=UTF-8');
		header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
		header('Referrer-Policy: same-origin');

		$title = trim(Minz_Request::paramString('title', true));
		if ($title === '') {
			$this->renderJson([
				'status' => 'error',
				'count' => null,
				'searchUrl' => null,
				'error' => 'missing_title',
			]);
			return;
		}

		$searchUrl = $this->buildSearchUrl($title);
		$html = $this->fetchSearchPage($searchUrl);
		if ($html === null) {
			$this->renderJson([
				'status' => 'error',
				'count' => null,
				'searchUrl' => $searchUrl,
				'error' => 'fetch_failed',
			]);
			return;
		}

		$count = $this->extractAvailableCount($html);
		if ($count === null) {
			$this->renderJson([
				'status' => 'error',
				'count' => null,
				'searchUrl' => $searchUrl,
				'error' => 'parse_failed',
			]);
			return;
		}

		$this->renderJson([
			'status' => $count > 0 ? 'available' : 'missing',
			'count' => $count,
			'searchUrl' => $searchUrl,
			'error' => null,
		]);
	}

	private function buildSearchUrl(string $title): string {
		$query = http_build_query([
			'q' => $title,
			'searchType' => 'standard',
			'isFacet' => 'true',
			'view' => 'standard',
			'searchWay' => 'title200a',
			'rows' => '10',
			'sortWay' => 'score',
			'sortOrder' => 'desc',
			'hasholding' => '1',
			'searchWay0' => 'marc',
			'logical0' => 'AND',
			'curlibcode' => '0000',
		], '', '&', PHP_QUERY_RFC3986);

		return self::SEARCH_URL . '?' . $query;
	}

	private function fetchSearchPage(string $url): ?string {
		if (function_exists('curl_init')) {
			return $this->fetchSearchPageWithCurl($url);
		}

		return $this->fetchSearchPageWithStream($url);
	}

	private function fetchSearchPageWithCurl(string $url): ?string {
		$ch = curl_init($url);
		if ($ch === false) {
			return null;
		}

		curl_setopt_array($ch, [
			CURLOPT_RETURNTRANSFER => true,
			CURLOPT_FOLLOWLOCATION => true,
			CURLOPT_MAXREDIRS => 3,
			CURLOPT_CONNECTTIMEOUT => 5,
			CURLOPT_TIMEOUT => 10,
			CURLOPT_HTTPHEADER => [
				'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Accept-Language: zh-CN,zh;q=0.9,en;q=0.6',
			],
			CURLOPT_USERAGENT => 'FreshRSS LibScan/0.1',
		]);

		$html = curl_exec($ch);
		$statusCode = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
		curl_close($ch);

		if (!is_string($html) || $html === '' || $statusCode < 200 || $statusCode >= 300) {
			return null;
		}

		return $html;
	}

	private function fetchSearchPageWithStream(string $url): ?string {
		$context = stream_context_create([
			'http' => [
				'method' => 'GET',
				'timeout' => 10,
				'ignore_errors' => true,
				'header' => implode("\r\n", [
					'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
					'Accept-Language: zh-CN,zh;q=0.9,en;q=0.6',
					'Connection: close',
					'User-Agent: FreshRSS LibScan/0.1',
				]),
			],
		]);

		$html = @file_get_contents($url, false, $context);
		if (!is_string($html) || $html === '') {
			return null;
		}

		$statusLine = null;
		if (isset($http_response_header) && is_array($http_response_header) && isset($http_response_header[0]) && is_string($http_response_header[0])) {
			$statusLine = $http_response_header[0];
		}

		if ($statusLine !== null && !preg_match('/\s2\d\d\s/', $statusLine)) {
			return null;
		}

		return $html;
	}

	private function extractAvailableCount(string $html): ?int {
		if (preg_match('/<ol[^>]*id=["\']loanableFacetUL["\'][^>]*>.*?<span[^>]*class=["\']facetCount["\'][^>]*>\((\d+)\)<\/span>/su', $html, $matches) === 1) {
			return (int)$matches[1];
		}

		if (preg_match('/在馆\s*[:：]?\s*<\/h4>.*?title=["\'](\d+)["\']/su', $html, $matches) === 1) {
			return (int)$matches[1];
		}

		if (preg_match('/检索到\s*:?\s*(\d+)\s*条结果/su', $html, $matches) === 1) {
			return (int)$matches[1] > 0 ? 1 : 0;
		}

		if (preg_match('/在馆\((\d+)\)\/馆藏\((\d+)\)/su', $html, $matches) === 1) {
			return (int)$matches[1];
		}

		return null;
	}

	private function renderJson(array $payload): void {
		$json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
		if (!is_string($json)) {
			header('HTTP/1.1 500 Internal Server Error');
			echo '{"status":"error","count":null,"searchUrl":null,"error":"json_encode_failed"}';
			return;
		}

		echo $json;
	}
}