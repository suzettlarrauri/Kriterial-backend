import { Module } from '@nestjs/common';
import { PromptRegistry } from './prompt-registry.service.js';

@Module({
  providers: [PromptRegistry],
  exports: [PromptRegistry],
})
export class PromptsModule {}
