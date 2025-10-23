/*
 * SPDX-FileCopyrightText: 2025 Your Name and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { promises as fs } from 'fs';
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
import { createTemp } from '@/misc/create-temp.js';
import { DriveService } from '@/core/DriveService.js';
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
		private driveService: DriveService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('llm-request');
	}

	@bindThis
	public async process(job: Bull.Job<LlmRequestJobData>): Promise<void> {
		const { userId, prompt, eventId, modality } = job.data;
		this.logger.info(`Processing LLM ${modality} job ${job.id} for user ${userId}`);

		try {
			const user = await this.usersRepository.findOneBy({ id: userId }) as MiLocalUser;
			if (modality === 'text') {
				const generatedText = await this.llmService.generateText(prompt);
				// // 結果を下書きに保存
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
			} else {
				// base64文字列 (string型)として画像を取得
				const imageData = await this.llmService.generateImage(prompt);
				// Base64デコード
				const parts = imageData.split(',');
				const pureBase64 = parts.length > 1 ? parts[parts.length - 1] : parts[0];
				const buffer = Buffer.from(pureBase64, 'base64');

				const [tempFilePath, cleanup] = await createTemp();
				let savedDriveFile;
				try {
					// 一時ファイルに書き込み
					await fs.writeFile(tempFilePath, buffer);
					const fileName = `AI-Gen-${prompt.substring(0, 20)}-${Date.now()}.png`;
					savedDriveFile = await this.driveService.addFile({
						user: user,
						path: tempFilePath,
						name: fileName,
						comment: `Generated from prompt: "${prompt}"`,
						folderId: null,
						force: false,
						sensitive: false,
						requestIp: null,
						requestHeaders: null,
					});
				} catch (driveErr) {
					this.logger.warn(`Failed to save generated image to drive: ${driveErr}`);
					throw new Error;
				} finally {
					cleanup();
				}
			}

			// // 成功をユーザーに通知
			this.notificationService.createNotification(userId, 'llmRequestSuccess', {
				eventId: eventId,
			});
		} catch (err) {
			this.logger.error(`Failed to process LLM job ${job.id}: ${err}`);

			// // 失敗をユーザーに通知
			this.notificationService.createNotification(userId, 'llmRequestFailed', {
				promptSnippet: prompt.substring(0, 50) + '...',
			});
		}
	}
}
