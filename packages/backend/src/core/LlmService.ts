/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import { CacheService } from '@/core/CacheService.js';

@Injectable()
export class LlmService {
	constructor(
		private cacheService: CacheService,
	) {
	}

	@bindThis
	public async generateText(prompt: string): Promise<string> {
		/// Simulate delay
		await new Promise(resolve => setTimeout(resolve, 2000));

		return `Generated text for prompt: ${prompt}`;
	}
}
