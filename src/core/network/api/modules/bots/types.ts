import type { BotCommand, BotInfo } from '../../types/bot';

export type GetMyInfoResponse = BotInfo;

export type EditMyCommandsDTO = {
  body: {
    commands: readonly BotCommand[];
  }
};

export type EditMyCommandsResponse = {
  commands: BotCommand[];
};
