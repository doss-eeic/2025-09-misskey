/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { GoogleGenAI, Modality } from '@google/genai';
import dotenv from 'dotenv';
import * as Redis from 'ioredis';
import { bindThis } from '@/decorators.js';
import { CacheService } from '@/core/CacheService.js';
import type { MiUser } from '@/models/User.js';
import { DI } from '@/di-symbols.js';
import { QueueService } from '@/core/QueueService.js';
import { LIMIT_PER_MINUTE_GLOBAL, LIMIT_PER_HOUR_USER } from '@/const.js';

@Injectable()
export class LlmService {
	private genAI: GoogleGenAI;

	constructor(
		@Inject(DI.redis)
		private redisClient: Redis.Redis,
		private queueService: QueueService,
	) {
	}

	onModuleInit() {
		dotenv.config();

		const apiKey = process.env.GEMINI_API_KEY;
		console.log('Using Gemini API Key:', apiKey);

		if (!apiKey) {
			throw new Error('Gemini API key is not set');
		}

		this.genAI = new GoogleGenAI({ apiKey });
	}

	@bindThis
	public async checkUserRateLimits(userId: string): Promise<boolean> {
		const now = new Date();

		// ユーザーごとのレートリミット (1時間ごと)
		const currentHour = now.toISOString().substring(0, 13); // 'YYYY-MM-DDTHH'
		const userKey = `llm-limit:user:${userId}:${currentHour}`;

		try {
			const pipeline = this.redisClient.multi();

			pipeline.incr(userKey);
			pipeline.expire(userKey, 3600 + 300); // 1時間15分

			const results = await pipeline.exec();
			if (results == null) {
				throw new Error('Redis error on user rate limit check');
			}

			const userIncrResult = results[0];
			if (userIncrResult[0] !== null) throw userIncrResult[0];
			const userCount = userIncrResult[1] as number;

			if (userCount > LIMIT_PER_HOUR_USER) {
				console.warn(`レートリミット超過 (ユーザー): ${userId}, カウント: ${userCount}`);
				return false;
			}

			return true;
		} catch (error) {
			console.error('error in user rate limit check:', error);
			return false;
		}
	}

	@bindThis
	public async checkGlobalRateLimits(): Promise<boolean> {
		const now = new Date();

		// サーバー全体のレートリミット (1分ごと)
		const currentMinute = now.toISOString().substring(0, 16); // 'YYYY-MM-DDTHH:mm'
		const globalKey = `llm-limit:global:${currentMinute}`;

		try {
			const pipeline = this.redisClient.multi();

			pipeline.incr(globalKey);
			pipeline.expire(globalKey, 60 + 30); // 1分30秒

			const results = await pipeline.exec();
			if (results == null) {
				throw new Error('Redis error on global rate limit check');
			}

			const globalIncrResult = results[0];
			if (globalIncrResult[0] !== null) throw globalIncrResult[0];
			const globalCount = globalIncrResult[1] as number;

			if (globalCount > LIMIT_PER_MINUTE_GLOBAL) {
				console.warn(`レートリミット超過 (グローバル), カウント: ${globalCount}`);
				return false;
			}

			return true;
		} catch (error) {
			console.error('error in global rate limit check:', error);
			return false;
		}
	}

	@bindThis
	public async generateText(prompt: string): Promise<string> {
		try {
			const response = await this.genAI.models.generateContent({
				model: 'gemini-2.0-flash-001',
				contents: prompt,
			});

			let generatedText = '';
			const textProp = (response as any).text;

			if (typeof textProp === 'function') {
				const val = textProp();
				generatedText = val != null ? String(val) : '';
			} else if (typeof textProp === 'string') {
				generatedText = textProp;
			} else if ((response as any).candidates && Array.isArray((response as any).candidates) && (response as any).candidates[0]) {
				const cand = (response as any).candidates[0];
				if (typeof cand === 'string') {
					generatedText = cand;
				} else if (cand.output) {
					generatedText = String(cand.output);
				} else if (cand.content) {
					generatedText = String(cand.content);
				} else {
					generatedText = String(cand);
				}
			} else if ((response as any).outputText) {
				generatedText = String((response as any).outputText);
			} else {
				generatedText = String(response);
			}

			generatedText = generatedText.trim();
			return generatedText;
		} catch (e: any) {
			throw new Error(`Error generating text: ${e.message}`);
		}
	}

	public async generateImage(prompt: string): Promise<string> {
		try {
			const response = await this.genAI.models.generateContent({
				model: 'models/gemini-2.0-flash-exp',
				contents: prompt,
				config: { responseModalities: [Modality.TEXT, Modality.IMAGE] },
			});

			if (response?.candidates?.[0]?.content?.parts) {
				for (const part of response.candidates[0].content.parts) {
					if (part.inlineData && part.inlineData.data) {
						const imageData = part.inlineData.data;
						return imageData;
					}
				}
			} else {
				throw new Error('No image data found in the response');
			}
			throw new Error('No image data found in the response');
			// return "iVBORw0KGgoAAAANSUhEUgAAAAIAAAAECAYAAACk7+45AAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAAAXSURBVBhXY/z///9/BgYGBiYGKMBkAACGLgQEllwMjQAAAABJRU5ErkJggg=="
		} catch (e: any) {
			throw new Error(`Error generating image: ${e.message}`);
		}
	}

	@bindThis
	public async addLlmGenerateJob(userId: string, prompt: string, modality: 'text' | 'image'): Promise<void> {
		const jobName = modality === 'text' ? 'llmGenerateText' : 'llmGenerateImage';
		try {
			await this.queueService.llmRequestQueue.add(jobName, {
				userId: userId,
				prompt: prompt,
				modality: modality,
				eventId: randomUUID(),
			}, {
				removeOnComplete: {
					age: 3600 * 24 * 7, // keep up to 7 days
					count: 1000, // 完了ジョブを1000件まで保持
				},
				removeOnFail: {
					age: 3600 * 24 * 7, // keep up to 7 days
					count: 1000, // 失敗ジョブを1000件まで保持
				},
			});
		} catch (e: any) {
			console.error('Failed to add LLM job to queue:', e);
			throw new Error(`Error adding generate text job: ${e.message}`);
		}
	}
}
