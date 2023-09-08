package com.budgetExplorer.app.dto;

import lombok.*;

import java.time.LocalDateTime;

@Getter
@Setter
@AllArgsConstructor
@NoArgsConstructor
@ToString
public class Output {
    private String message;
    private LocalDateTime timestamp = LocalDateTime.now(); // STORES THE CURRENT DATE & TIME
}