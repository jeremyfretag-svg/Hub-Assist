#![cfg(test)]
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

use crate::{
    errors::AccessControlError,
    types::{AccessControlConfig, MultiSigConfig, ProposalAction, UserRole},
    AccessControlContract, AccessControlContractClient,
};

// ── helpers ───────────────────────────────────────────────────────────────────

fn default_multisig() -> MultiSigConfig {
    MultiSigConfig { threshold: 1, critical_threshold: 2, time_lock_duration: 0 }
}

fn setup(env: &Env) -> (Address, AccessControlContractClient) {
    env.mock_all_auths();
    let id = env.register_contract(None, AccessControlContract);
    let client = AccessControlContractClient::new(env, &id);
    let admin = Address::generate(env);
    client.initialize(&admin, &default_multisig());
    (admin, client)
}

// ── initialize ────────────────────────────────────────────────────────────────

#[test]
fn test_initialize_sets_admin_role() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    assert!(client.is_admin(&admin));
    let info = client.get_role(&admin);
    assert_eq!(info.role, UserRole::Admin);
}

#[test]
fn test_initialize_default_config_not_paused() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    // contract is not paused — set_role should succeed
    let user = Address::generate(&env);
    assert!(client.try_set_role(&admin, &user, &UserRole::Member).is_ok());
}

// ── set_role / get_role ───────────────────────────────────────────────────────

#[test]
fn test_set_role_success() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let user = Address::generate(&env);
    client.set_role(&admin, &user, &UserRole::Staff);
    let info = client.get_role(&user);
    assert_eq!(info.role, UserRole::Staff);
    assert_eq!(info.user, user);
}

#[test]
fn test_set_role_non_admin_returns_unauthorized() {
    let env = Env::default();
    let (_, client) = setup(&env);
    let not_admin = Address::generate(&env);
    let user = Address::generate(&env);
    let result = client.try_set_role(&not_admin, &user, &UserRole::Member);
    assert_eq!(result, Err(Ok(AccessControlError::Unauthorized)));
}

#[test]
fn test_get_role_not_found_returns_user_not_found() {
    let env = Env::default();
    let (_, client) = setup(&env);
    let stranger = Address::generate(&env);
    let result = client.try_get_role(&stranger);
    assert_eq!(result, Err(Ok(AccessControlError::UserNotFound)));
}

// ── check_access ──────────────────────────────────────────────────────────────

#[test]
fn test_check_access_returns_true_for_sufficient_role() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let user = Address::generate(&env);
    client.set_role(&admin, &user, &UserRole::Staff);
    assert!(client.check_access(&user, &UserRole::Member));
    assert!(client.check_access(&user, &UserRole::Staff));
    assert!(!client.check_access(&user, &UserRole::Admin));
}

#[test]
fn test_check_access_returns_false_for_unknown_user() {
    let env = Env::default();
    let (_, client) = setup(&env);
    let stranger = Address::generate(&env);
    assert!(client.check_access(&stranger, &UserRole::Guest));
    assert!(!client.check_access(&stranger, &UserRole::Member));
}

// ── require_access ────────────────────────────────────────────────────────────

#[test]
fn test_require_access_ok_for_correct_role() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let user = Address::generate(&env);
    client.set_role(&admin, &user, &UserRole::Member);
    assert!(client.try_require_access(&user, &UserRole::Member).is_ok());
    assert!(client.try_require_access(&user, &UserRole::Guest).is_ok());
}

#[test]
fn test_require_access_unauthorized_for_wrong_role() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let user = Address::generate(&env);
    client.set_role(&admin, &user, &UserRole::Member);
    let result = client.try_require_access(&user, &UserRole::Staff);
    assert_eq!(result, Err(Ok(AccessControlError::Unauthorized)));
}

// ── pause / unpause ───────────────────────────────────────────────────────────

#[test]
fn test_paused_contract_rejects_set_role() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    client.pause(&admin);
    let user = Address::generate(&env);
    let result = client.try_set_role(&admin, &user, &UserRole::Member);
    assert_eq!(result, Err(Ok(AccessControlError::ContractPaused)));
}

#[test]
fn test_paused_contract_rejects_create_proposal() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    client.pause(&admin);
    let target = Address::generate(&env);
    let result = client.try_create_proposal(
        &admin,
        &ProposalAction::SetRole(target, UserRole::Member),
    );
    assert_eq!(result, Err(Ok(AccessControlError::ContractPaused)));
}

#[test]
fn test_unpause_restores_operations() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    client.pause(&admin);
    client.unpause(&admin);
    let user = Address::generate(&env);
    assert!(client.try_set_role(&admin, &user, &UserRole::Member).is_ok());
}

// ── multisig proposal flow ────────────────────────────────────────────────────

#[test]
fn test_proposal_flow_threshold_1() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let target = Address::generate(&env);
    // admin proposes (auto-approved as first approver) and executes immediately
    let pid = client
        .create_proposal(&admin, &ProposalAction::SetRole(target.clone(), UserRole::Member));
    client.execute_proposal(&admin, &pid);
    let info = client.get_role(&target);
    assert_eq!(info.role, UserRole::Member);
}

#[test]
fn test_proposal_threshold_not_met_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, AccessControlContract);
    let client = AccessControlContractClient::new(&env, &id);
    let admin = Address::generate(&env);
    // threshold = 2
    client.initialize(
        &admin,
        &MultiSigConfig { threshold: 2, critical_threshold: 3, time_lock_duration: 0 },
    );
    let target = Address::generate(&env);
    let pid = client
        .create_proposal(&admin, &ProposalAction::SetRole(target, UserRole::Member));
    // only 1 approval (proposer) — threshold is 2
    let result = client.try_execute_proposal(&admin, &pid);
    assert_eq!(result, Err(Ok(AccessControlError::ThresholdNotMet)));
}

#[test]
fn test_proposal_multi_approver_flow() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, AccessControlContract);
    let client = AccessControlContractClient::new(&env, &id);
    let admin = Address::generate(&env);
    let signer2 = Address::generate(&env);
    client.initialize(
        &admin,
        &MultiSigConfig { threshold: 2, critical_threshold: 3, time_lock_duration: 0 },
    );
    // give signer2 Staff role so they can approve
    client.set_role(&admin, &signer2, &UserRole::Staff);
    let target = Address::generate(&env);
    let pid = client
        .create_proposal(&admin, &ProposalAction::SetRole(target.clone(), UserRole::Member));
    client.approve_proposal(&signer2, &pid);
    client.execute_proposal(&admin, &pid);
    assert_eq!(client.get_role(&target).role, UserRole::Member);
}

#[test]
fn test_approve_proposal_already_approved_returns_error() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, AccessControlContract);
    let client = AccessControlContractClient::new(&env, &id);
    let admin = Address::generate(&env);
    client.initialize(
        &admin,
        &MultiSigConfig { threshold: 2, critical_threshold: 3, time_lock_duration: 0 },
    );
    let target = Address::generate(&env);
    let pid = client
        .create_proposal(&admin, &ProposalAction::SetRole(target, UserRole::Member));
    // admin already approved at creation
    let result = client.try_approve_proposal(&admin, &pid);
    assert_eq!(result, Err(Ok(AccessControlError::AlreadyApproved)));
}

// ── time-lock ─────────────────────────────────────────────────────────────────

#[test]
fn test_time_lock_blocks_early_execution() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);
    let id = env.register_contract(None, AccessControlContract);
    let client = AccessControlContractClient::new(&env, &id);
    let admin = Address::generate(&env);
    client.initialize(
        &admin,
        &MultiSigConfig { threshold: 1, critical_threshold: 2, time_lock_duration: 500 },
    );
    let target = Address::generate(&env);
    let pid = client
        .create_proposal(&admin, &ProposalAction::SetRole(target, UserRole::Member));
    // still within lock window (execution_time = 1500, now = 1000)
    let result = client.try_execute_proposal(&admin, &pid);
    assert_eq!(result, Err(Ok(AccessControlError::TimeLockActive)));
}

#[test]
fn test_time_lock_allows_execution_after_delay() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1_000);
    let id = env.register_contract(None, AccessControlContract);
    let client = AccessControlContractClient::new(&env, &id);
    let admin = Address::generate(&env);
    client.initialize(
        &admin,
        &MultiSigConfig { threshold: 1, critical_threshold: 2, time_lock_duration: 500 },
    );
    let target = Address::generate(&env);
    let pid = client
        .create_proposal(&admin, &ProposalAction::SetRole(target.clone(), UserRole::Member));
    env.ledger().set_timestamp(1_500);
    client.execute_proposal(&admin, &pid);
    assert_eq!(client.get_role(&target).role, UserRole::Member);
}

// ── remove_role ───────────────────────────────────────────────────────────────

#[test]
fn test_remove_role_success() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let user = Address::generate(&env);
    client.set_role(&admin, &user, &UserRole::Member);
    client.remove_role(&admin, &user);
    assert_eq!(
        client.try_get_role(&user),
        Err(Ok(AccessControlError::UserNotFound))
    );
    assert!(!client.check_access(&user, &UserRole::Guest));
}

#[test]
fn test_remove_role_user_not_found_returns_error() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let stranger = Address::generate(&env);
    let result = client.try_remove_role(&admin, &stranger);
    assert_eq!(result, Err(Ok(AccessControlError::UserNotFound)));
}

#[test]
fn test_remove_role_non_admin_returns_unauthorized() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let user = Address::generate(&env);
    client.set_role(&admin, &user, &UserRole::Member);
    let not_admin = Address::generate(&env);
    let result = client.try_remove_role(&not_admin, &user);
    assert_eq!(result, Err(Ok(AccessControlError::Unauthorized)));
}

// ── role hierarchy ────────────────────────────────────────────────────────────

#[test]
fn test_admin_can_set_any_role() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let user = Address::generate(&env);
    for role in [UserRole::Guest, UserRole::Member, UserRole::Staff, UserRole::Admin] {
        client.set_role(&admin, &user, &role);
        assert_eq!(client.get_role(&user).role, role);
    }
}

#[test]
fn test_staff_cannot_set_roles() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let staff = Address::generate(&env);
    let target = Address::generate(&env);
    client.set_role(&admin, &staff, &UserRole::Staff);
    let result = client.try_set_role(&staff, &target, &UserRole::Member);
    assert_eq!(result, Err(Ok(AccessControlError::Unauthorized)));
}

// ── check_access per role level ───────────────────────────────────────────────

#[test]
fn test_check_access_all_role_levels() {
    let env = Env::default();
    let (admin, client) = setup(&env);

    let guest = Address::generate(&env);
    client.set_role(&admin, &guest, &UserRole::Guest);
    assert!(client.check_access(&guest, &UserRole::Guest));
    assert!(!client.check_access(&guest, &UserRole::Member));

    let member = Address::generate(&env);
    client.set_role(&admin, &member, &UserRole::Member);
    assert!(client.check_access(&member, &UserRole::Guest));
    assert!(client.check_access(&member, &UserRole::Member));
    assert!(!client.check_access(&member, &UserRole::Staff));

    let staff = Address::generate(&env);
    client.set_role(&admin, &staff, &UserRole::Staff);
    assert!(client.check_access(&staff, &UserRole::Member));
    assert!(client.check_access(&staff, &UserRole::Staff));
    assert!(!client.check_access(&staff, &UserRole::Admin));

    assert!(client.check_access(&admin, &UserRole::Admin));
}

// ── multisig: threshold + duplicate approver ──────────────────────────────────

#[test]
fn test_multisig_requires_threshold_approvals() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, AccessControlContract);
    let client = AccessControlContractClient::new(&env, &id);
    let admin = Address::generate(&env);
    let signer2 = Address::generate(&env);
    let signer3 = Address::generate(&env);
    client.initialize(
        &admin,
        &MultiSigConfig { threshold: 3, critical_threshold: 3, time_lock_duration: 0 },
    );
    client.set_role(&admin, &signer2, &UserRole::Staff);
    client.set_role(&admin, &signer3, &UserRole::Staff);

    let target = Address::generate(&env);
    let pid = client
        .create_proposal(&admin, &ProposalAction::SetRole(target.clone(), UserRole::Member));

    // 1 approval (proposer) — not enough
    assert_eq!(
        client.try_execute_proposal(&admin, &pid),
        Err(Ok(AccessControlError::ThresholdNotMet))
    );
    client.approve_proposal(&signer2, &pid);
    // 2 approvals — still not enough
    assert_eq!(
        client.try_execute_proposal(&admin, &pid),
        Err(Ok(AccessControlError::ThresholdNotMet))
    );
    client.approve_proposal(&signer3, &pid);
    // 3 approvals — threshold met
    client.execute_proposal(&admin, &pid);
    assert_eq!(client.get_role(&target).role, UserRole::Member);
}

#[test]
fn test_same_approver_cannot_approve_twice() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, AccessControlContract);
    let client = AccessControlContractClient::new(&env, &id);
    let admin = Address::generate(&env);
    client.initialize(
        &admin,
        &MultiSigConfig { threshold: 2, critical_threshold: 3, time_lock_duration: 0 },
    );
    let target = Address::generate(&env);
    let pid = client
        .create_proposal(&admin, &ProposalAction::SetRole(target, UserRole::Member));
    // admin already approved at creation; second attempt must fail
    assert_eq!(
        client.try_approve_proposal(&admin, &pid),
        Err(Ok(AccessControlError::AlreadyApproved))
    );
}

// ── update_config: new threshold applies to subsequent proposals ──────────────

#[test]
fn test_update_config_new_threshold_applies() {
    let env = Env::default();
    let (admin, client) = setup(&env); // threshold = 1
    let signer2 = Address::generate(&env);
    client.set_role(&admin, &signer2, &UserRole::Staff);

    // raise threshold to 2
    client
        .update_config(
            &admin,
            &AccessControlConfig {
                multisig: MultiSigConfig { threshold: 2, critical_threshold: 3, time_lock_duration: 0 },
                paused: false,
            },
        );

    let target = Address::generate(&env);
    let pid = client
        .create_proposal(&admin, &ProposalAction::SetRole(target.clone(), UserRole::Member));
    // only 1 approval — now below new threshold of 2
    assert_eq!(
        client.try_execute_proposal(&admin, &pid),
        Err(Ok(AccessControlError::ThresholdNotMet))
    );
    client.approve_proposal(&signer2, &pid);
    client.execute_proposal(&admin, &pid);
    assert_eq!(client.get_role(&target).role, UserRole::Member);
}

// ── paused: all state-changing operations return ContractPaused ───────────────

#[test]
fn test_paused_rejects_all_state_changes() {
    let env = Env::default();
    env.mock_all_auths();
    let id = env.register_contract(None, AccessControlContract);
    let client = AccessControlContractClient::new(&env, &id);
    let admin = Address::generate(&env);
    let signer2 = Address::generate(&env);
    client.initialize(
        &admin,
        &MultiSigConfig { threshold: 2, critical_threshold: 3, time_lock_duration: 0 },
    );
    client.set_role(&admin, &signer2, &UserRole::Staff);

    // create a proposal before pausing so we can test approve/execute while paused
    let target = Address::generate(&env);
    let pid = client
        .create_proposal(&admin, &ProposalAction::SetRole(target.clone(), UserRole::Member));

    client.pause(&admin);

    let paused_void: Result<Result<(), _>, _> = Err(Ok(AccessControlError::ContractPaused));
    let paused_u64: Result<Result<u64, _>, _> = Err(Ok(AccessControlError::ContractPaused));
    assert_eq!(client.try_set_role(&admin, &target, &UserRole::Member), paused_void);
    assert_eq!(client.try_remove_role(&admin, &target), paused_void);
    assert_eq!(
        client.try_create_proposal(&admin, &ProposalAction::SetRole(target.clone(), UserRole::Member)),
        paused_u64
    );
    assert_eq!(client.try_approve_proposal(&signer2, &pid), paused_void);
    assert_eq!(client.try_execute_proposal(&admin, &pid), paused_void);
}

// ── remove_role: user reverts to Guest ───────────────────────────────────────

#[test]
fn test_remove_role_reverts_to_guest() {
    let env = Env::default();
    let (admin, client) = setup(&env);
    let user = Address::generate(&env);
    client.set_role(&admin, &user, &UserRole::Staff);
    assert!(client.check_access(&user, &UserRole::Staff));

    client.remove_role(&admin, &user);

    // no role entry → treated as Guest (check_access returns true for Guest, false for higher)
    assert!(client.check_access(&user, &UserRole::Guest));
    assert!(!client.check_access(&user, &UserRole::Member));
    assert_eq!(client.try_get_role(&user), Err(Ok(AccessControlError::UserNotFound)));
}
