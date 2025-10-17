/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { bindThis } from '@/decorators.js';
import { CacheService } from '@/core/CacheService.js';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class LlmService {
	private genAI: GoogleGenAI;

	constructor(
		private cacheService: CacheService,
	) {
	}

			if (!apiKey) {
				throw new Error('Gemini API key is not set');
	@bindThis
	public async generateText(prompt: string): Promise<string> {
		await new Promise(resolve => setTimeout(resolve, 2000));
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
}
