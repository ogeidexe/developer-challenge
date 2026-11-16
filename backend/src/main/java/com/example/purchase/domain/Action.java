package com.example.purchase.domain;

/** Transition actions of README §4.2. */
public enum Action {
    SUBMIT("submeter"), APPROVE("aprovar"), REJECT("rejeitar"), REQUEST_CHANGES("devolver para ajuste"), CANCEL("cancelar");

    private final String verb;

    Action(String verb) { this.verb = verb; }

    /** Portuguese infinitive used in user-facing 422 messages (README §4.3). */
    public String verb() { return verb; }
}
