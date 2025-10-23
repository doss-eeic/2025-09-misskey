/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { LlmService } from '@/core/LlmService.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['llm'],

	requireCredential: true,
	kind: 'read:account',

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			imageData: {
				type: 'string',
				optional: false, nullable: false,
			},
		},

	},
	errors: {
		tooManyRequests: {
			message: 'Too many requests. Please try again later.',
			code: 'TOO_MANY_REQUESTS',
			id: '0be3c0f2-fc37-4475-9da3-89k93cc63838',
			httpStatusCode: 429,
		},

		// 便宜上 ApiError 型の値とする
		aiRequestQueued: {
			message: 'The AI is currently busy. We\'ll notify you upon completion.',
			code: 'AI_REQUEST_QUEUED',
			id: '0be3c0f2-fc37-4475-9da3-80a93cc63838',
			httpStatusCode: 202,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		prompt: { type: 'string' },
	},
	required: ['prompt'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private llmService: LlmService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const MAX_PROMPT_LENGTH = 200;

			if (ps.prompt.length > MAX_PROMPT_LENGTH) {
				throw new Error(`prompt must be ${MAX_PROMPT_LENGTH} characters or less`);
			}
			if (!await this.llmService.checkUserRateLimits(me.id)) {
				// return 429 Too Many Requests
				throw new ApiError(meta.errors.tooManyRequests);
			}
			if (!await this.llmService.checkGlobalRateLimits()) {
				// return 202 Accepted
				this.llmService.addLlmGenerateJob(me.id, ps.prompt, 'image');
				throw new ApiError(meta.errors.aiRequestQueued);
			} else {
				const imageData = await this.llmService.generateImage(ps.prompt);

				return {
					imageData,
				};
			}
		});
	}
}
