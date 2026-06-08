/// <reference types="jest" />

import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateEnvironmentDto } from "./environment.dto";

describe("CreateEnvironmentDto", () => {
  const validEnvironment = {
    server_id: 1,
    type: "production",
    url: "https://example.com",
    root_path: "/var/www/example",
  };

  async function validateDto(input: Record<string, unknown>) {
    const dto = plainToInstance(CreateEnvironmentDto, input);
    return validate(dto, { whitelist: true });
  }

  it("accepts safe absolute remote paths", async () => {
    const errors = await validateDto({
      ...validEnvironment,
      root_path: "/var/www/site-1/current",
      backup_path: "/tmp/forge-backups/site_1",
    });

    expect(errors).toHaveLength(0);
  });

  it("rejects relative or traversal root paths", async () => {
    await expect(
      validateDto({ ...validEnvironment, root_path: "var/www/site" }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: "root_path" }),
      ]),
    );

    await expect(
      validateDto({ ...validEnvironment, root_path: "/var/www/../site" }),
    ).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: "root_path" }),
      ]),
    );
  });

  it("rejects unsupported environment types", async () => {
    const errors = await validateDto({
      ...validEnvironment,
      type: "qa",
    });

    expect(errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ property: "type" })]),
    );
  });

  it("rejects unsafe protected table names", async () => {
    const errors = await validateDto({
      ...validEnvironment,
      protected_tables: ["wp_users", "wp;options"],
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: "protected_tables" }),
      ]),
    );
  });

  it("accepts valid protected table names used by custom plugins", async () => {
    const errors = await validateDto({
      ...validEnvironment,
      protected_tables: [
        "wp_ct_registrations",
        "wp_lamah_certificates",
        "wp_frmt_form_entry_meta",
        "wp_posts",
      ],
    });

    expect(errors).toHaveLength(0);
  });

  it("rejects protected table names with hyphens instead of silently rewriting them", async () => {
    const errors = await validateDto({
      ...validEnvironment,
      protected_tables: ["wp-valid-but-hyphenated"],
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: "protected_tables" }),
      ]),
    );
  });

  it("accepts valid protected custom post type slugs", async () => {
    const errors = await validateDto({
      ...validEnvironment,
      protected_post_types: ["project", "course", "lesson_type", "lesson-type"],
    });

    expect(errors).toHaveLength(0);
  });

  it("rejects unsafe protected custom post type slugs", async () => {
    const errors = await validateDto({
      ...validEnvironment,
      protected_post_types: ["project", "project;DROP"],
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: "protected_post_types" }),
      ]),
    );
  });
});
