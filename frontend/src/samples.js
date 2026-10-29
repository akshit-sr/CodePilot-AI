// One short file per supported language, each with a few deliberate problems for the reviewer to find.
export const SAMPLES = {
  python: ["sample.py", `import requests

API_KEY = "demo_secret_not_for_production_123"


def get_user(user_id):
    url = f"https://api.example.com/users/{user_id}"
    response = requests.get(url, headers={"Authorization": API_KEY})
    return response.json()


def format_name(user):
    return user["first_name"] + " " + user["last_name"]
`],
  javascript: ["users.js", `const API_KEY = "demo_secret_not_for_production_123";

async function getUser(id) {
  const res = await fetch("https://api.example.com/users/" + id, { headers: { Authorization: API_KEY } });
  return res.json();
}

function total(items) {
  let sum = 0;
  for (var i = 0; i <= items.length; i++) sum += items[i].price;
  return sum;
}
`],
  typescript: ["cart.ts", `interface Item { name: string; price: number }

export function total(items: Item[]): number {
  let sum = 0;
  for (let i = 0; i <= items.length; i++) sum += items[i].price;
  return sum;
}

export function parseQty(input: any): number {
  return parseInt(input);
}
`],
  java: ["Accounts.java", `import java.sql.*;

public class Accounts {
    public static ResultSet find(Connection db, String name) throws SQLException {
        Statement st = db.createStatement();
        return st.executeQuery("SELECT * FROM users WHERE name = '" + name + "'");
    }

    public static boolean same(String a, String b) {
        return a == b;
    }
}
`],
  c: ["greet.c", `#include <stdio.h>
#include <string.h>

void greet(const char *name) {
    char buf[16];
    strcpy(buf, name);
    printf(buf);
}

int main(void) {
    greet("a name that is much longer than sixteen bytes");
    return 0;
}
`],
  cpp: ["numbers.cpp", `#include <iostream>
#include <vector>

int* makeArray(int n) {
    int* data = new int[n];
    return data;
}

int main() {
    std::vector<int> v = {1, 2, 3};
    for (size_t i = 0; i <= v.size(); i++) std::cout << v[i] << "\\n";
    int* a = makeArray(10);
    return 0;
}
`],
  csharp: ["Login.cs", `using System;
using System.Data.SqlClient;

class Login {
    static string Password = "hunter2";

    static bool Check(SqlConnection db, string user, string pass) {
        var cmd = new SqlCommand("SELECT COUNT(*) FROM users WHERE name='" + user + "' AND pass='" + pass + "'", db);
        return (int)cmd.ExecuteScalar() > 0;
    }
}
`],
  go: ["main.go", `package main

import (
	"fmt"
	"os"
)

func main() {
	f, _ := os.Open("config.txt")
	buf := make([]byte, 100)
	f.Read(buf)
	fmt.Println(string(buf))
}
`],
  rust: ["main.rs", `use std::fs;

fn read_config(path: &str) -> String {
    fs::read_to_string(path).unwrap()
}

fn main() {
    let items = vec![1, 2, 3];
    let idx = 3;
    println!("{}", items[idx]);
    println!("{}", read_config("config.toml"));
}
`],
  php: ["login.php", `<?php
$user = $_GET["user"];
$db = new mysqli("localhost", "root", "", "app");
$result = $db->query("SELECT * FROM users WHERE name = '$user'");
while ($row = $result->fetch_assoc()) {
    echo "Hello " . $row["name"];
}
`],
  ruby: ["report.rb", `def average(numbers)
  numbers.sum / numbers.size
end

def list(dir)
  system("ls " + dir)
end

puts average([1, 2])
`],
  kotlin: ["Main.kt", `fun findUser(users: Map<String, String>, id: String): String {
    return users[id]!!
}

fun main() {
    val users = mapOf("1" to "Ada")
    println(findUser(users, "2"))
}
`],
};
