/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import { CacheService } from '@/core/CacheService.js';
import { GoogleGenAI, Modality} from '@google/genai';
import dotenv from 'dotenv';

@Injectable()
export class LlmService {
	private genAI: GoogleGenAI;

	constructor(
		private cacheService: CacheService,
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
	public async generateText(prompt: string): Promise<string> {
		try {
			const response = await this.genAI.models.generateContent({
				model: 'gemini-2.0-flash-001',
				contents: prompt,
			});

			let generatedText = '';

			if (response == null) {
				throw new Error('No response from Gemini API');
			}

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

	@bindThis
	public async generateImage(prompt: string): Promise<string> {
		try {
			const response = await this.genAI.models.generateContent({
				model: "models/gemini-2.0-flash-exp",
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
}
