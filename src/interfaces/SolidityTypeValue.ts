type SolidityType = "bytes32" | "address" | "uint" | "bytes" | "bool";

interface SolidityTypeValue {
  t: SolidityType;
  v: string;
}

export { SolidityTypeValue };
