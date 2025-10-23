/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { LlmService } from '@/core/LlmService.js';

export const meta = {
	tags: ['llm'],

	requireCredential: false,

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
		super(meta, paramDef, async (ps) => {
			const MAX_PROMPT_LENGTH = 200;

			if (ps.prompt.length > MAX_PROMPT_LENGTH) {
				throw new Error(`prompt must be ${MAX_PROMPT_LENGTH} characters or less`);
			}

			const imageData = await this.llmService.generateImage(ps.prompt);

			return {
				imageData,
			};
		});
	}
}