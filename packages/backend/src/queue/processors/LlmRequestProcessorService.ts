/*
 * SPDX-FileCopyrightText: 2025 Your Name and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import type Logger from '@/logger.js';
import { NotificationService } from '@/core/NotificationService.js';
import { bindThis } from '@/decorators.js';
import { LlmService } from '@/core/LlmService.js'; // ★ LlmService をインポート
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';
import type { LlmRequestJobData } from '../types.js';

@Injectable()
export class LlmRequestProcessorService {
	private logger: Logger;

	constructor(
		private llmService: LlmService,
		private notificationService: NotificationService,
		private queueLoggerService: QueueLoggerService,
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
			console.log(generatedText);

			// // 2. 結果をDBに保存 (LlmServiceにこのメソッドを実装する必要がある)
			// // これにより llm/get-note エンドポイントが結果を取得できるようになる
			// await this.llmService.saveResult(eventId, userId, generatedText);
			// ここで下書きに保存する draftService

			// // 3. 成功をユーザーに通知
			// this.notificationService.createNotification(userId, 'llmRequestSuccess', {
			// 	eventId: eventId,
			// });
		} catch (err) {
			this.logger.error(`Failed to process LLM job ${job.id}: ${err}`);

			// // 4. 失敗をユーザーに通知
			// this.notificationService.createNotification(userId, 'llmRequestFailed', {
			// 	// エラー内容やプロンプトの一部などを渡す
			// 	promptSnippet: prompt.substring(0, 50) + '...',
			// });
		}
	}
}
