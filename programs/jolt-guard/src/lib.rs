#![deny(unsafe_code)]

#[cfg(not(test))]
use solana_program::sysvar::{clock::Clock, Sysvar};
use solana_program::{
    account_info::AccountInfo,
    entrypoint,
    entrypoint::ProgramResult,
    hash::hashv,
    instruction::{AccountMeta, Instruction},
    msg,
    program::{invoke, set_return_data},
    program_error::ProgramError,
    pubkey::Pubkey,
};

const MAGIC: &[u8; 4] = b"JOLT";
const VERSION: u8 = 1;
const FIXED_ACCOUNTS: usize = 5;
const AMOUNT_OFFSET: usize = 64;
const AMOUNT_END: usize = 72;
const RECEIPT_MAGIC: &[u8; 4] = b"JRC1";
const HOOK_MAGIC: &[u8; 4] = b"JHK1";
const TOKEN_PROGRAM_ID: Pubkey =
    solana_program::pubkey!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
const TOKEN_2022_PROGRAM_ID: Pubkey =
    solana_program::pubkey!("TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb");

const INVALID_DATA: u32 = 1;
const EXPIRED: u32 = 2;
const MAX_INPUT: u32 = 3;
const MIN_OUTPUT: u32 = 4;
const BALANCE_DIRECTION: u32 = 5;
const INVALID_INDEX: u32 = 6;
const INVALID_PROGRAM: u32 = 7;
const INVALID_INTENT_ID: u32 = 8;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ExecuteIntent {
    pub expires_at_slot: u64,
    pub max_input: u64,
    pub min_output: u64,
    pub intent_id: [u8; 32],
    pub route_indices: Vec<u8>,
    pub hook_indices: Vec<u8>,
    pub route_data: Vec<u8>,
    pub hook_payload: Vec<u8>,
}

impl ExecuteIntent {
    pub fn unpack(data: &[u8]) -> Result<Self, ProgramError> {
        let mut cursor = Cursor::new(data);
        if cursor.take(4)? != MAGIC || cursor.u8()? != VERSION {
            return Err(custom(INVALID_DATA));
        }
        let expires_at_slot = cursor.u64()?;
        let max_input = cursor.u64()?;
        let min_output = cursor.u64()?;
        let mut intent_id = [0u8; 32];
        intent_id.copy_from_slice(cursor.take(32)?);
        let route_count = cursor.u16()? as usize;
        let hook_count = cursor.u16()? as usize;
        let route_data_len = cursor.u32()? as usize;
        let hook_payload_len = cursor.u32()? as usize;
        let route_indices = cursor.take(route_count)?.to_vec();
        let hook_indices = cursor.take(hook_count)?.to_vec();
        let route_data = cursor.take(route_data_len)?.to_vec();
        let hook_payload = cursor.take(hook_payload_len)?.to_vec();
        if !cursor.is_empty() || route_indices.is_empty() {
            return Err(custom(INVALID_DATA));
        }
        Ok(Self {
            expires_at_slot,
            max_input,
            min_output,
            intent_id,
            route_indices,
            hook_indices,
            route_data,
            hook_payload,
        })
    }
}

struct Cursor<'a> {
    data: &'a [u8],
    offset: usize,
}

impl<'a> Cursor<'a> {
    fn new(data: &'a [u8]) -> Self {
        Self { data, offset: 0 }
    }
    fn take(&mut self, length: usize) -> Result<&'a [u8], ProgramError> {
        let end = self
            .offset
            .checked_add(length)
            .ok_or_else(|| custom(INVALID_DATA))?;
        let value = self
            .data
            .get(self.offset..end)
            .ok_or_else(|| custom(INVALID_DATA))?;
        self.offset = end;
        Ok(value)
    }
    fn u8(&mut self) -> Result<u8, ProgramError> {
        Ok(self.take(1)?[0])
    }
    fn u16(&mut self) -> Result<u16, ProgramError> {
        Ok(u16::from_le_bytes(
            self.take(2)?.try_into().map_err(|_| custom(INVALID_DATA))?,
        ))
    }
    fn u32(&mut self) -> Result<u32, ProgramError> {
        Ok(u32::from_le_bytes(
            self.take(4)?.try_into().map_err(|_| custom(INVALID_DATA))?,
        ))
    }
    fn u64(&mut self) -> Result<u64, ProgramError> {
        Ok(u64::from_le_bytes(
            self.take(8)?.try_into().map_err(|_| custom(INVALID_DATA))?,
        ))
    }
    fn is_empty(&self) -> bool {
        self.offset == self.data.len()
    }
}

fn custom(code: u32) -> ProgramError {
    ProgramError::Custom(code)
}

fn token_amount(account: &AccountInfo) -> Result<u64, ProgramError> {
    if account.owner != &TOKEN_PROGRAM_ID && account.owner != &TOKEN_2022_PROGRAM_ID {
        return Err(ProgramError::IllegalOwner);
    }
    let data = account.try_borrow_data()?;
    let bytes = data
        .get(AMOUNT_OFFSET..AMOUNT_END)
        .ok_or(ProgramError::InvalidAccountData)?;
    Ok(u64::from_le_bytes(
        bytes
            .try_into()
            .map_err(|_| ProgramError::InvalidAccountData)?,
    ))
}

fn indexed_cpi<'a>(
    program: &AccountInfo<'a>,
    accounts: &[AccountInfo<'a>],
    indices: &[u8],
    data: Vec<u8>,
) -> ProgramResult {
    let mut metas = Vec::with_capacity(indices.len());
    let mut infos = Vec::with_capacity(indices.len() + 1);
    for raw_index in indices {
        let index = *raw_index as usize;
        if index == 3 || index == 4 {
            return Err(custom(INVALID_INDEX));
        }
        let account = accounts.get(index).ok_or_else(|| custom(INVALID_INDEX))?;
        metas.push(if account.is_writable {
            AccountMeta::new(*account.key, account.is_signer)
        } else {
            AccountMeta::new_readonly(*account.key, account.is_signer)
        });
        infos.push(account.clone());
    }
    infos.push(program.clone());
    invoke(
        &Instruction {
            program_id: *program.key,
            accounts: metas,
            data,
        },
        &infos,
    )
}

fn hook_data(
    phase: u8,
    intent: &ExecuteIntent,
    source_before: u64,
    destination_before: u64,
    source_spent: u64,
    destination_received: u64,
) -> Vec<u8> {
    let mut data = Vec::with_capacity(102 + intent.hook_payload.len());
    data.extend_from_slice(HOOK_MAGIC);
    data.push(VERSION);
    data.push(phase);
    data.extend_from_slice(&intent.intent_id);
    for value in [
        intent.expires_at_slot,
        intent.max_input,
        intent.min_output,
        source_before,
        destination_before,
        source_spent,
        destination_received,
    ] {
        data.extend_from_slice(&value.to_le_bytes());
    }
    data.extend_from_slice(&(intent.hook_payload.len() as u32).to_le_bytes());
    data.extend_from_slice(&intent.hook_payload);
    data
}

fn receipt_data(intent: &ExecuteIntent, source_spent: u64, destination_received: u64) -> Vec<u8> {
    let mut data = Vec::with_capacity(53);
    data.extend_from_slice(RECEIPT_MAGIC);
    data.push(VERSION);
    data.extend_from_slice(&intent.intent_id);
    data.extend_from_slice(&source_spent.to_le_bytes());
    data.extend_from_slice(&destination_received.to_le_bytes());
    data
}

fn canonical_intent_id(accounts: &[AccountInfo], intent: &ExecuteIntent) -> [u8; 32] {
    let mut header = Vec::with_capacity(37);
    header.push(VERSION);
    header.extend_from_slice(&intent.expires_at_slot.to_le_bytes());
    header.extend_from_slice(&intent.max_input.to_le_bytes());
    header.extend_from_slice(&intent.min_output.to_le_bytes());
    header.extend_from_slice(&(intent.route_indices.len() as u16).to_le_bytes());
    header.extend_from_slice(&(intent.hook_indices.len() as u16).to_le_bytes());
    header.extend_from_slice(&(intent.route_data.len() as u32).to_le_bytes());
    header.extend_from_slice(&(intent.hook_payload.len() as u32).to_le_bytes());

    let mut account_bindings = Vec::with_capacity(2 + accounts.len() * 34);
    account_bindings.extend_from_slice(&(accounts.len() as u16).to_le_bytes());
    for account in accounts {
        account_bindings.extend_from_slice(account.key.as_ref());
        account_bindings.push(u8::from(account.is_signer));
        account_bindings.push(u8::from(account.is_writable));
    }

    hashv(&[
        b"JOLT_INTENT_V1",
        &header,
        &intent.route_indices,
        &intent.hook_indices,
        &intent.route_data,
        &intent.hook_payload,
        &account_bindings,
    ])
    .to_bytes()
}

#[cfg(not(test))]
fn current_slot() -> Result<u64, ProgramError> {
    Ok(Clock::get()?.slot)
}

#[cfg(test)]
fn current_slot() -> Result<u64, ProgramError> {
    Ok(100)
}

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    if accounts.len() < FIXED_ACCOUNTS {
        return Err(ProgramError::NotEnoughAccountKeys);
    }
    let authority = &accounts[0];
    let source = &accounts[1];
    let destination = &accounts[2];
    let route_program = &accounts[3];
    let hook_program = &accounts[4];
    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }
    if !source.is_writable || !destination.is_writable {
        return Err(ProgramError::InvalidAccountData);
    }
    if !route_program.executable || route_program.key == program_id {
        return Err(custom(INVALID_PROGRAM));
    }

    let intent = ExecuteIntent::unpack(instruction_data)?;
    if canonical_intent_id(accounts, &intent) != intent.intent_id {
        return Err(custom(INVALID_INTENT_ID));
    }
    let current_slot = current_slot()?;
    if intent.expires_at_slot != 0 && current_slot > intent.expires_at_slot {
        return Err(custom(EXPIRED));
    }
    let source_before = token_amount(source)?;
    let destination_before = token_amount(destination)?;

    if !intent.hook_indices.is_empty() {
        if !hook_program.executable || hook_program.key == program_id {
            return Err(custom(INVALID_PROGRAM));
        }
        indexed_cpi(
            hook_program,
            accounts,
            &intent.hook_indices,
            hook_data(0, &intent, source_before, destination_before, 0, 0),
        )?;
    }

    indexed_cpi(
        route_program,
        accounts,
        &intent.route_indices,
        intent.route_data.clone(),
    )?;

    let source_after = token_amount(source)?;
    let destination_after = token_amount(destination)?;
    let source_spent = source_before
        .checked_sub(source_after)
        .ok_or_else(|| custom(BALANCE_DIRECTION))?;
    let destination_received = destination_after
        .checked_sub(destination_before)
        .ok_or_else(|| custom(BALANCE_DIRECTION))?;
    if source_spent > intent.max_input {
        return Err(custom(MAX_INPUT));
    }
    if destination_received < intent.min_output {
        return Err(custom(MIN_OUTPUT));
    }

    if !intent.hook_indices.is_empty() {
        indexed_cpi(
            hook_program,
            accounts,
            &intent.hook_indices,
            hook_data(
                1,
                &intent,
                source_before,
                destination_before,
                source_spent,
                destination_received,
            ),
        )?;
    }

    set_return_data(&receipt_data(&intent, source_spent, destination_received));
    msg!(
        "JOLT_RECEIPT input={} output={} slot={}",
        source_spent,
        destination_received,
        current_slot
    );
    Ok(())
}

#[cfg(not(feature = "no-entrypoint"))]
entrypoint!(process_instruction);

#[cfg(test)]
mod tests {
    use super::*;
    use solana_program::{
        instruction::Instruction,
        program_stubs::{set_syscall_stubs, SyscallStubs},
    };
    use std::sync::{Arc, Mutex};

    static EXECUTION_TEST_LOCK: Mutex<()> = Mutex::new(());

    fn encoded() -> Vec<u8> {
        let mut data = Vec::new();
        data.extend_from_slice(MAGIC);
        data.push(VERSION);
        data.extend_from_slice(&55u64.to_le_bytes());
        data.extend_from_slice(&100u64.to_le_bytes());
        data.extend_from_slice(&95u64.to_le_bytes());
        data.extend_from_slice(&[7u8; 32]);
        data.extend_from_slice(&2u16.to_le_bytes());
        data.extend_from_slice(&1u16.to_le_bytes());
        data.extend_from_slice(&3u32.to_le_bytes());
        data.extend_from_slice(&2u32.to_le_bytes());
        data.extend_from_slice(&[0, 5]);
        data.extend_from_slice(&[6]);
        data.extend_from_slice(&[9, 8, 7]);
        data.extend_from_slice(&[4, 2]);
        data
    }

    #[test]
    fn parses_execute_intent_v1() {
        let parsed = ExecuteIntent::unpack(&encoded()).unwrap();
        assert_eq!(parsed.expires_at_slot, 55);
        assert_eq!(parsed.max_input, 100);
        assert_eq!(parsed.min_output, 95);
        assert_eq!(parsed.intent_id, [7u8; 32]);
        assert_eq!(parsed.route_indices, vec![0, 5]);
        assert_eq!(parsed.hook_indices, vec![6]);
        assert_eq!(parsed.route_data, vec![9, 8, 7]);
        assert_eq!(parsed.hook_payload, vec![4, 2]);
    }

    #[test]
    fn rejects_invalid_encoding() {
        let mut trailing = encoded();
        trailing.push(1);
        assert_eq!(
            ExecuteIntent::unpack(&trailing),
            Err(ProgramError::Custom(INVALID_DATA))
        );
        assert!(ExecuteIntent::unpack(&encoded()[..20]).is_err());
    }

    #[derive(Default)]
    struct StubState {
        route_program: Pubkey,
        hook_program: Pubkey,
        spend: u64,
        receive: u64,
        hook_phases: Vec<u8>,
        receipt: Vec<u8>,
    }

    struct ExecutionStubs(Arc<Mutex<StubState>>);

    impl SyscallStubs for ExecutionStubs {
        fn sol_invoke_signed(
            &self,
            instruction: &Instruction,
            account_infos: &[AccountInfo],
            _signers_seeds: &[&[&[u8]]],
        ) -> ProgramResult {
            let mut state = self.0.lock().unwrap();
            if instruction.program_id == state.route_program {
                let source = account_infos[0].clone();
                let destination = account_infos[1].clone();
                let source_before = token_amount(&source)?;
                let destination_before = token_amount(&destination)?;
                source.try_borrow_mut_data()?[AMOUNT_OFFSET..AMOUNT_END]
                    .copy_from_slice(&(source_before - state.spend).to_le_bytes());
                destination.try_borrow_mut_data()?[AMOUNT_OFFSET..AMOUNT_END]
                    .copy_from_slice(&(destination_before + state.receive).to_le_bytes());
            } else if instruction.program_id == state.hook_program {
                state.hook_phases.push(instruction.data[5]);
            }
            Ok(())
        }

        fn sol_set_return_data(&self, data: &[u8]) {
            self.0.lock().unwrap().receipt = data.to_vec();
        }
    }

    fn execute_with_deltas(
        spend: u64,
        receive: u64,
        max_input: u64,
        min_output: u64,
    ) -> ProgramResult {
        let _test_guard = EXECUTION_TEST_LOCK.lock().unwrap();
        let program_id = Pubkey::new_unique();
        let authority_key = Pubkey::new_unique();
        let source_key = Pubkey::new_unique();
        let destination_key = Pubkey::new_unique();
        let route_key = Pubkey::new_unique();
        let hook_key = Pubkey::new_unique();
        let owner = Pubkey::new_unique();
        let mut authority_lamports = 0;
        let mut source_lamports = 0;
        let mut destination_lamports = 0;
        let mut route_lamports = 0;
        let mut hook_lamports = 0;
        let mut authority_data = [];
        let mut source_data = [0u8; 165];
        let mut destination_data = [0u8; 165];
        let mut route_data = [];
        let mut hook_data = [];
        source_data[AMOUNT_OFFSET..AMOUNT_END].copy_from_slice(&1_000u64.to_le_bytes());
        destination_data[AMOUNT_OFFSET..AMOUNT_END].copy_from_slice(&200u64.to_le_bytes());

        let accounts = vec![
            AccountInfo::new(
                &authority_key,
                true,
                false,
                &mut authority_lamports,
                &mut authority_data,
                &owner,
                false,
            ),
            AccountInfo::new(
                &source_key,
                false,
                true,
                &mut source_lamports,
                &mut source_data,
                &TOKEN_PROGRAM_ID,
                false,
            ),
            AccountInfo::new(
                &destination_key,
                false,
                true,
                &mut destination_lamports,
                &mut destination_data,
                &TOKEN_PROGRAM_ID,
                false,
            ),
            AccountInfo::new(
                &route_key,
                false,
                false,
                &mut route_lamports,
                &mut route_data,
                &owner,
                true,
            ),
            AccountInfo::new(
                &hook_key,
                false,
                false,
                &mut hook_lamports,
                &mut hook_data,
                &owner,
                true,
            ),
        ];

        let state = Arc::new(Mutex::new(StubState {
            route_program: route_key,
            hook_program: hook_key,
            spend,
            receive,
            ..StubState::default()
        }));
        let previous = set_syscall_stubs(Box::new(ExecutionStubs(state.clone())));
        let mut data = encoded();
        data[5..13].copy_from_slice(&0u64.to_le_bytes());
        data[13..21].copy_from_slice(&max_input.to_le_bytes());
        data[21..29].copy_from_slice(&min_output.to_le_bytes());
        data[61..63].copy_from_slice(&2u16.to_le_bytes());
        data[63..65].copy_from_slice(&1u16.to_le_bytes());
        data[73..75].copy_from_slice(&[1, 2]);
        data[75] = 1;
        let parsed = ExecuteIntent::unpack(&data).unwrap();
        data[29..61].copy_from_slice(&canonical_intent_id(&accounts, &parsed));
        let result = process_instruction(&program_id, &accounts, &data);
        set_syscall_stubs(previous);

        if result.is_ok() {
            let state = state.lock().unwrap();
            assert_eq!(state.hook_phases, vec![0, 1]);
            assert_eq!(&state.receipt[..4], RECEIPT_MAGIC);
            assert_eq!(
                u64::from_le_bytes(state.receipt[37..45].try_into().unwrap()),
                spend
            );
            assert_eq!(
                u64::from_le_bytes(state.receipt[45..53].try_into().unwrap()),
                receive
            );
        }
        result
    }

    #[test]
    fn executes_route_and_emits_verified_receipt() {
        assert_eq!(execute_with_deltas(100, 95, 100, 95), Ok(()));
    }

    #[test]
    fn rejects_route_below_output_floor() {
        assert_eq!(
            execute_with_deltas(100, 94, 100, 95),
            Err(custom(MIN_OUTPUT))
        );
    }

    #[test]
    fn rejects_route_above_input_ceiling() {
        assert_eq!(
            execute_with_deltas(101, 95, 100, 95),
            Err(custom(MAX_INPUT))
        );
    }
}
