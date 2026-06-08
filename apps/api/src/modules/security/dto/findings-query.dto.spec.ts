/// <reference types="jest" />

import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { FindingsQueryDto } from "./findings-query.dto";

describe("FindingsQueryDto", () => {
  async function validateDto(input: Record<string, unknown>) {
    const dto = plainToInstance(FindingsQueryDto, input);
    const errors = await validate(dto);
    return { dto, errors };
  }

  it("accepts bounded pagination values", async () => {
    const { dto, errors } = await validateDto({ page: "2", limit: "100" });

    expect(errors).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(100);
  });

  it("rejects oversized finding pages", async () => {
    const { errors } = await validateDto({ limit: "101" });

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: "limit" })]),
    );
  });
});
