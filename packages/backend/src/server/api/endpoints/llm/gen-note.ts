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
			suggestedText: {
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
		userQuery: { type: 'string' },
		noteDraft: { type: 'string', nullable: true },

	},
	required: ['userQuery'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private llmService: LlmService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const MAX_QUERY_LENGTH = 100;
			const MAX_DRAFT_LENGTH = 100;
			if (ps.userQuery.length > MAX_QUERY_LENGTH) {
				throw new Error(`userQuery must be ${MAX_QUERY_LENGTH} characters or less`);
			}
			if (!await this.llmService.checkUserRateLimits(me.id)) {
				// return 429 Too Many Requests
				throw new ApiError(meta.errors.tooManyRequests);
			}
			let prompt: string;
			if (ps.noteDraft) {
				if (ps.noteDraft.length > MAX_DRAFT_LENGTH) {
					throw new Error(`noteDraft must be ${MAX_DRAFT_LENGTH} characters or less`);
				}
				prompt = `以下のユーザーの指示に従って、SNSに投稿する文章の下書きを修正してください。前置きは書かず投稿の本文のみを回答してください。絵文字やハッシュタグも効果的に使用してください。\n指示: ${ps.userQuery}\n下書き: ${ps.noteDraft}`;
			} else {
				prompt = `以下のユーザーの指示に従って、SNSに投稿する文章をしてください。前置きは書かず投稿の本文のみを回答してください。絵文字やハッシュタグも効果的に使用してください。\n指示: ${ps.userQuery}`;
			}

			if (!await this.llmService.checkGlobalRateLimits()) {
				// return 202 Accepted
				this.llmService.addLlmGenerateJob(me.id, prompt, 'text');
				throw new ApiError(meta.errors.aiRequestQueued);
			} else {
				const generatedText = await this.llmService.generateText(prompt);
				return { suggestedText: generatedText };
			}
		});
	}
}
