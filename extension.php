<?php

declare(strict_types=1);

final class LibScanExtension extends Minz_Extension
{
	#[\Override]
	public function init(): void {
		parent::init();

		$this->registerController('libscan');
		Minz_View::appendScript($this->getFileUrl('script.js'));
		Minz_View::appendStyle($this->getFileUrl('style.css'));
	}
}