import * as z from "zod";

import {
  BUTTON_CONTRACT_PROFILE,
  buttonComponentContractSchema,
  toButtonComponentContractDigestSubject,
  validateButtonComponentContractWithTokenSet,
  type ButtonComponentContract,
} from "./button-contract.js";
import { createToolkitError } from "./errors.js";
import {
  ICON_CONTRACT_PROFILE,
  iconComponentContractSchema,
  toIconComponentContractDigestSubject,
  validateIconComponentContractWithTokenSet,
  type IconComponentContract,
} from "./icon-contract.js";
import { createFailureResult, createSuccessResult } from "./results.js";
import type { ToolkitResult } from "./results.js";
import { toValidationIssues } from "./schema-validation.js";

export const COMPONENT_CONTRACT_PROFILES = [
  BUTTON_CONTRACT_PROFILE,
  ICON_CONTRACT_PROFILE,
] as const;

export const componentContractSchema = z.discriminatedUnion("profile", [
  buttonComponentContractSchema,
  iconComponentContractSchema,
]);

export type ComponentContract = z.infer<typeof componentContractSchema>;
export type ComponentContractDigestSubject =
  | Omit<ButtonComponentContract, "contentDigest">
  | Omit<IconComponentContract, "contentDigest">;

export function validateComponentContract(
  input: unknown,
): ToolkitResult<ComponentContract> {
  const result = componentContractSchema.safeParse(input);
  if (result.success) return createSuccessResult(result.data);
  const issues = toValidationIssues(result.error);
  return createFailureResult(
    createToolkitError({
      code: "VALIDATION_FAILED",
      context: { details: { issues } },
      message: `The Component Contract contains ${String(issues.length)} validation issue(s).`,
      recoveryInstruction:
        "Use a supported Component profile and correct the fields listed in context.details.issues.",
      target: { logicalId: "component-contract", type: "component" },
    }),
  );
}

export function validateComponentContractWithTokenSet(
  contractInput: unknown,
  tokenSetInput: unknown,
): ToolkitResult<ComponentContract> {
  const contractResult = validateComponentContract(contractInput);
  if (!contractResult.ok) return contractResult;
  return contractResult.data.profile === BUTTON_CONTRACT_PROFILE
    ? validateButtonComponentContractWithTokenSet(
        contractResult.data,
        tokenSetInput,
      )
    : validateIconComponentContractWithTokenSet(
        contractResult.data,
        tokenSetInput,
      );
}

export function toComponentContractDigestSubject(
  contract: ComponentContract,
): ComponentContractDigestSubject {
  return contract.profile === BUTTON_CONTRACT_PROFILE
    ? toButtonComponentContractDigestSubject(contract)
    : toIconComponentContractDigestSubject(contract);
}
