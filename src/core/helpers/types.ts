export type NullableObject<ObjectType> = {
  [Key in keyof ObjectType]: ObjectType[Key] | null
};

export type MaybeArray<Value> = Value | readonly Value[];

export type Guard<Input = unknown, Output extends Input = Input> = (
  value: Input
) => value is Output;
