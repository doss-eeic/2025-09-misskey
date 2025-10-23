/*
 * SPDX-FileCopyrightText: 2025 Your Name and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type Logger from '@/logger.js';
import { NotificationService } from '@/core/NotificationService.js';
import { bindThis } from '@/decorators.js';
import { LlmService } from '@/core/LlmService.js'; // ★ LlmService をインポート
import { NoteDraftService, NoteDraftOptions } from '@/core/NoteDraftService.js';
import { ApiError } from '@/server/api/error.js';
import { MiLocalUser } from '@/models/User.js';
import type { UsersRepository } from '@/models/_.js';
import { DI } from '@/di-symbols.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { LlmRequestJobData } from '../types.js';

@Injectable()
export class LlmRequestProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,
		private llmService: LlmService,
		private notificationService: NotificationService,
		private queueLoggerService: QueueLoggerService,
		private noteDraftService: NoteDraftService,

	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('llm-request');
	}

	@bindThis
	public async process(job: Bull.Job<LlmRequestJobData>): Promise<void> {
		this.logger.info(`Processing LLM job ${job.id} for user ${job.data.userId}`);
		const { userId, prompt, eventId } = job.data;

		try {
			// 1. 外部APIを叩いてテキストを生成
			const generatedText = await this.llmService.generateText(prompt);

			// // 2. 結果を下書きに保存 (LlmServiceにこのメソッドを実装する必要がある)
			const user = await this.usersRepository.findOneBy({ id: userId }) as MiLocalUser;
			const data = {
				text: generatedText,
				fileIds: [],
				pollChoices: [],
				pollMultiple: false,
				pollExpiresAt: null,
				pollExpiredAfter: null,
				hasPoll: false,
				replyId: null,
				renoteId: null,
				cw: null,
				hashtag: null,
				localOnly: false,
				reactionAcceptance: null,
				visibility: 'public' as const,
				visibleUserIds: [],
				channelId: null,
				scheduledAt: null,
				isActuallyScheduled: false,
			};
			const draft = await this.noteDraftService.create(user, data);

			// // 3. 成功をユーザーに通知
			this.notificationService.createNotification(userId, 'llmRequestSuccess', {
				eventId: eventId,
			});
		} catch (err) {
			this.logger.error(`Failed to process LLM job ${job.id}: ${err}`);

			// // 4. 失敗をユーザーに通知
			this.notificationService.createNotification(userId, 'llmRequestFailed', {
				promptSnippet: prompt.substring(0, 50) + '...',
			});
		}
	}
}
