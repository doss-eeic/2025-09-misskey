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
			suggestedText: {
				type: 'string',
				optional: false, nullable: false,
			},
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
		super(meta, paramDef, async (ps) => {
			const MAX_QUERY_LENGTH = 100;
			const MAX_DRAFT_LENGTH = 100;

			if (ps.userQuery.length > MAX_QUERY_LENGTH) {
				throw new Error(`userQuery must be ${MAX_QUERY_LENGTH} characters or less`);
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

			const generatedText = await this.llmService.generateText(prompt);
			return { suggestedText: generatedText };
		});
	}
}
