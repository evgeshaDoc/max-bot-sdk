import type { Int64 } from './int64';

type MakeMarkup<MarkupType extends string, MarkupData extends object = object> = {
  type: MarkupType;
  from: number;
  length: number;
} & {
  [key in keyof MarkupData]: MarkupData[key];
};

export type UserMentionMarkup = MakeMarkup<'user_mention', {
  user_link?: string | null;
  user_id?: Int64 | null;
}>;

export type MarkupElement =
  | MakeMarkup<'strong'>
  | MakeMarkup<'emphasized'>
  | MakeMarkup<'monospaced'>
  | MakeMarkup<'link', { url: string }>
  | MakeMarkup<'strikethrough'>
  | MakeMarkup<'underline'>
  | MakeMarkup<'heading'>
  | MakeMarkup<'highlighted'>
  | MakeMarkup<'quote'>
  | UserMentionMarkup;
